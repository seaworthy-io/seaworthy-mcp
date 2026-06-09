import { TOOL_DEFINITIONS, executeTool } from './tools';
import type { Env } from './env';

// Seaworthy Insurance MCP server (open / zero-touch).
//
// All tools are callable without authentication so a user can direct their agent
// to get quotes with no further interaction on their part. The write tool
// (quote_request) is protected from abuse by server-side controls — strict input
// validation, per-IP rate limiting, and duplicate suppression — not by a human
// consent step. Read tools expose only public information already on the site.
//
// Stateless Streamable HTTP transport: each POST /mcp is an independent JSON-RPC
// request (spec.modelcontextprotocol.io).

const PROTOCOL_VERSION = '2025-06-18';
const SERVER_INFO = {
  name: 'Seaworthy Insurance MCP',
  version: '0.3.0'
};

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, Mcp-Session-Id',
  'Access-Control-Expose-Headers': 'Mcp-Session-Id'
};

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS, ...(init?.headers || {}) }
  });
}

function rpcError(id: string | number | null, code: number, message: string, data?: unknown): JsonRpcResponse {
  return { jsonrpc: '2.0', id, error: { code, message, data } };
}

function rpcResult(id: string | number | null, result: unknown): JsonRpcResponse {
  return { jsonrpc: '2.0', id, result };
}

async function handleRpc(
  req: JsonRpcRequest,
  env: Env,
  ctx: { userAgent?: string; ip?: string }
): Promise<JsonRpcResponse | null> {
  const id = req.id ?? null;
  switch (req.method) {
    case 'initialize':
      return rpcResult(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false }, resources: {}, prompts: {} },
        serverInfo: SERVER_INFO,
        instructions:
          'Seaworthy Insurance MCP. Tools cover specialty guides, quote comparison, benefit-cap math, rider selection, and a quote_request action that submits a disability insurance quote to the agency on the user\'s behalf. Before calling quote_request, confirm the user has given explicit consent to be contacted. Content is educational, not individual advice.'
      });
    case 'initialized':
    case 'notifications/initialized':
      return null;
    case 'tools/list':
      return rpcResult(id, {
        tools: TOOL_DEFINITIONS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema }))
      });
    // We do not implement prompts or resources, and no longer advertise them, but
    // answer their list methods with empty arrays so strict inspectors that probe
    // anyway (e.g. Glama) get a valid response instead of -32601.
    case 'prompts/list':
      return rpcResult(id, { prompts: [] });
    case 'resources/list':
      return rpcResult(id, { resources: [] });
    case 'resources/templates/list':
      return rpcResult(id, { resourceTemplates: [] });
    case 'tools/call': {
      const name = String(req.params?.name || '');
      const args = (req.params?.arguments || {}) as Record<string, unknown>;
      if (!name) return rpcError(id, -32602, 'Invalid params: name is required');
      const tool = TOOL_DEFINITIONS.find((t) => t.name === name);
      if (!tool) return rpcError(id, -32601, `Unknown tool: ${name}`);
      const result = await executeTool(name, args, env, ctx);
      return rpcResult(id, result);
    }
    case 'ping':
      return rpcResult(id, {});
    default:
      return rpcError(id, -32601, `Method not found: ${req.method}`);
  }
}

function buildServerCard(origin: string) {
  return {
    schemaVersion: '0.1.0-preview',
    status: 'live',
    serverInfo: { ...SERVER_INFO, homepage: 'https://seaworthy.io', contact: 'contact@seaworthy.io' },
    transport: { type: 'streamable-http', endpoint: `${origin}/mcp`, status: 'live' },
    capabilities: {
      tools: TOOL_DEFINITIONS.map((t) => ({ name: t.name, description: t.description })),
      resources: [],
      prompts: []
    },
    security: {
      // Open endpoint: no auth required. The write tool is abuse-controlled
      // server-side (validation + per-IP rate limiting + duplicate suppression).
      type: 'none',
      authRequired: false
    }
  };
}

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const origin = url.origin;

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });

    if (url.pathname === '/' || url.pathname === '/health') {
      return jsonResponse({ ok: true, service: SERVER_INFO });
    }

    if (url.pathname === '/.well-known/mcp/server-card.json') {
      // No-store: the card reflects live auth posture and must never serve stale
      // (a cached OAuth-era card would misdirect agents to a non-existent flow).
      return jsonResponse(buildServerCard(origin), { headers: { 'Cache-Control': 'no-store' } });
    }

    if (url.pathname === '/mcp') {
      if (request.method === 'GET') {
        return new Response('POST JSON-RPC to this path.', { status: 405, headers: { ...CORS_HEADERS, Allow: 'POST' } });
      }
      if (request.method !== 'POST') {
        return new Response('Method Not Allowed', { status: 405, headers: { ...CORS_HEADERS, Allow: 'POST' } });
      }
      const callCtx = {
        userAgent: request.headers.get('user-agent') || undefined,
        ip: request.headers.get('cf-connecting-ip') || undefined
      };
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return jsonResponse(rpcError(null, -32700, 'Parse error'), { status: 400 });
      }
      if (Array.isArray(body)) {
        const responses = await Promise.all(body.map((r) => handleRpc(r as JsonRpcRequest, env, callCtx)));
        return jsonResponse(responses.filter((r) => r !== null));
      }
      const resp = await handleRpc(body as JsonRpcRequest, env, callCtx);
      if (resp === null) return new Response(null, { status: 202, headers: CORS_HEADERS });
      return jsonResponse(resp);
    }

    return new Response('Not Found', { status: 404, headers: CORS_HEADERS });
  }
} satisfies ExportedHandler<Env>;

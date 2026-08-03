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
//
// Dual-revision support (2026-07-28 upgrade): the 2026-07-28 spec removed the
// initialize handshake — clients carry protocol version + capabilities in each
// request's _meta and may probe via server/discover. Both paths are served:
// legacy clients get the old handshake unchanged; new-rev clients get
// server/discover, per-request version validation, and CacheableResult fields.
// resultType/serverInfo/ttlMs decorations are emitted unconditionally — the
// 2025-06-18 Result type tolerates unknown extra fields.

const PROTOCOL_VERSION = '2025-06-18'; // revision negotiated via the legacy initialize handshake
const SUPPORTED_VERSIONS = ['2026-07-28', '2025-06-18']; // newest first; server/discover advertises these
const META_VERSION_KEY = 'io.modelcontextprotocol/protocolVersion';
const META_SERVER_INFO_KEY = 'io.modelcontextprotocol/serverInfo';
// 2026-07-28 error codes (spec error-code allocation policy)
const HEADER_MISMATCH = -32020;
const UNSUPPORTED_PROTOCOL_VERSION = -32022;
// Cache hint on list results: knowledge changes only on deploy; 1h is safe.
const LIST_CACHE = { ttlMs: 3600_000, cacheScope: 'public' as const };

const SERVER_INFO = {
  name: 'Seaworthy Insurance MCP',
  version: '0.4.0'
};

const SERVER_INSTRUCTIONS =
  'Seaworthy Insurance MCP. Tools cover specialty guides, quote comparison, benefit-cap math, rider selection, and a quote_request action that submits a disability insurance quote to the agency on the user\'s behalf. Before calling quote_request, confirm the user has given explicit consent to be contacted. Content is educational, not individual advice.';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, Mcp-Session-Id, MCP-Protocol-Version, Mcp-Method, Mcp-Name',
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
  // Decorate every result with the 2026-07-28 required fields. Old-rev clients
  // ignore the extras; merging preserves any _meta a tool result already carries.
  const r = result as Record<string, unknown>;
  const meta = (r._meta && typeof r._meta === 'object' ? r._meta : {}) as Record<string, unknown>;
  return {
    jsonrpc: '2.0',
    id,
    result: {
      resultType: 'complete',
      ...r,
      _meta: { [META_SERVER_INFO_KEY]: SERVER_INFO, ...meta }
    }
  };
}

// Pre-dispatch validation for the 2026-07-28 stateless path. Returns an error
// response to short-circuit with, or null to proceed. Enforcement is lenient by
// design (an open server optimizes for agent compatibility): headers are checked
// for CONSISTENCY when present, never required.
function validateStatelessRequest(req: JsonRpcRequest, headers: Headers): { resp: JsonRpcResponse; status: number } | null {
  const id = req.id ?? null;
  const metaVersion = (req.params?._meta as Record<string, unknown> | undefined)?.[META_VERSION_KEY];
  const headerVersion = headers.get('mcp-protocol-version');
  if (typeof metaVersion === 'string') {
    if (headerVersion && headerVersion !== metaVersion) {
      return {
        resp: rpcError(id, HEADER_MISMATCH, `MCP-Protocol-Version header (${headerVersion}) does not match _meta protocol version (${metaVersion})`),
        status: 400
      };
    }
    if (!SUPPORTED_VERSIONS.includes(metaVersion)) {
      return {
        resp: rpcError(id, UNSUPPORTED_PROTOCOL_VERSION, `Unsupported protocol version: ${metaVersion}`, {
          supported: SUPPORTED_VERSIONS,
          requested: metaVersion
        }),
        status: 400
      };
    }
  }
  const headerMethod = headers.get('mcp-method');
  if (headerMethod && headerMethod !== req.method) {
    return {
      resp: rpcError(id, HEADER_MISMATCH, `Mcp-Method header (${headerMethod}) does not match request method (${req.method})`),
      status: 400
    };
  }
  const headerName = headers.get('mcp-name');
  if (headerName && req.method === 'tools/call' && req.params?.name && headerName !== String(req.params.name)) {
    return {
      resp: rpcError(id, HEADER_MISMATCH, `Mcp-Name header (${headerName}) does not match tool name (${String(req.params.name)})`),
      status: 400
    };
  }
  return null;
}

async function handleRpc(
  req: JsonRpcRequest,
  env: Env,
  ctx: { userAgent?: string; ip?: string }
): Promise<JsonRpcResponse | null> {
  const id = req.id ?? null;
  switch (req.method) {
    case 'initialize':
      // Legacy (pre-2026-07-28) handshake. Kept indefinitely: older clients
      // negotiate here and never send per-request _meta versions.
      return rpcResult(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false }, resources: {}, prompts: {} },
        serverInfo: SERVER_INFO,
        instructions: SERVER_INSTRUCTIONS
      });
    case 'initialized':
    case 'notifications/initialized':
      return null;
    case 'server/discover':
      // 2026-07-28: mandatory discovery RPC — supported versions, capabilities, identity.
      return rpcResult(id, {
        supportedVersions: SUPPORTED_VERSIONS,
        capabilities: { tools: { listChanged: false } },
        instructions: SERVER_INSTRUCTIONS,
        ...LIST_CACHE
      });
    case 'tools/list':
      return rpcResult(id, {
        ...LIST_CACHE,
        tools: TOOL_DEFINITIONS.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
          // Advisory hints (read-only vs. write, open-world) so clients can gate the
          // consequential quote_request behind a human confirmation step.
          ...(t.annotations ? { annotations: t.annotations } : {})
        }))
      });
    // We do not implement prompts or resources, and no longer advertise them, but
    // answer their list methods with empty arrays so strict inspectors that probe
    // anyway (e.g. Glama) get a valid response instead of -32601.
    case 'prompts/list':
      return rpcResult(id, { prompts: [], ...LIST_CACHE });
    case 'resources/list':
      return rpcResult(id, { resources: [], ...LIST_CACHE });
    case 'resources/templates/list':
      return rpcResult(id, { resourceTemplates: [], ...LIST_CACHE });
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
    transport: { type: 'streamable-http', endpoint: `${origin}/mcp`, status: 'live', protocolVersions: SUPPORTED_VERSIONS },
    capabilities: {
      tools: TOOL_DEFINITIONS.map((t) => ({
        name: t.name,
        description: t.description,
        ...(t.annotations ? { annotations: t.annotations } : {})
      })),
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

    if (url.pathname === '/.well-known/mcpindex-challenge') {
      if (!env.MCPINDEX_CHALLENGE) return new Response('Not Found', { status: 404, headers: CORS_HEADERS });
      return new Response(env.MCPINDEX_CHALLENGE, {
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }
      });
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
        // Legacy batching (removed from the spec in 2025-06-18 but harmless to keep).
        const responses = await Promise.all(body.map((r) => handleRpc(r as JsonRpcRequest, env, callCtx)));
        return jsonResponse(responses.filter((r) => r !== null));
      }
      const rpcReq = body as JsonRpcRequest;
      const invalid = validateStatelessRequest(rpcReq, request.headers);
      if (invalid) return jsonResponse(invalid.resp, { status: invalid.status });
      const resp = await handleRpc(rpcReq, env, callCtx);
      if (resp === null) return new Response(null, { status: 202, headers: CORS_HEADERS });
      return jsonResponse(resp);
    }

    return new Response('Not Found', { status: 404, headers: CORS_HEADERS });
  }
} satisfies ExportedHandler<Env>;

// Glama quality-check bridge.
//
// The production Seaworthy MCP server is a remote Cloudflare Worker (Streamable
// HTTP at https://mcp.seaworthy.io/mcp), so it has no stdio entry point for
// Glama's mcp-proxy-based sandbox to launch. This small adapter uses mcp-proxy's
// startStdioServer to connect to the live endpoint and expose it over stdio, so
// Glama can introspect the real server during its quality checks.
// Not used in production.
import { ServerType, startStdioServer } from "mcp-proxy";

await startStdioServer({
  serverType: ServerType.HTTPStream,
  url: "https://mcp.seaworthy.io/mcp",
});

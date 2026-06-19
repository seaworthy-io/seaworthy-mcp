# Changelog

All notable changes to the Seaworthy MCP server are recorded here. The hosted
endpoint at `mcp.seaworthy.io` always runs the latest `main`.

## [1.0.0]

- Stable tool surface: `quote_request` (action) plus `get_specialty_guide`,
  `compare_carriers`, `estimate_benefit_cap_gap`, `list_riders`, and
  `get_education_article` (read).
- Streamable HTTP transport; stateless JSON-RPC.
- Write path hardened with input validation, per-IP rate limiting, and duplicate
  suppression.
- Bundled offline knowledge fallback so read tools stay available if the KV store
  is unreachable.
- Listed in the official MCP Registry (`io.seaworthy/mcp`) and on Glama.
- Added `SECURITY.md`, a CI typecheck workflow, and this changelog.

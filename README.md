# Seaworthy Insurance MCP Server

[![CI](https://github.com/seaworthy-io/seaworthy-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/seaworthy-io/seaworthy-mcp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![MCP Registry](https://img.shields.io/badge/MCP-Registry-5965E0.svg)](https://registry.modelcontextprotocol.io)

A live [Model Context Protocol](https://modelcontextprotocol.io) server that lets AI agents take action on behalf of their users with [Seaworthy Insurance](https://seaworthy.io), an independent brokerage specializing in individual disability insurance for high-income professionals (physicians, dentists, CRNAs, attorneys, executives).

To our knowledge, this is the first disability insurance brokerage to expose an agent-callable quote action over MCP.

## Endpoint

```
https://mcp.seaworthy.io/mcp
```

- **Transport:** Streamable HTTP
- **Auth:** none (open). The write action is protected server-side by input validation, per-IP rate limiting, and duplicate suppression rather than client authentication.
- **Server card:** https://seaworthy.io/.well-known/mcp/server-card.json
- **Registry:** `io.seaworthy/mcp` in the [official MCP Registry](https://registry.modelcontextprotocol.io)

## Tools

| Tool | Type | What it does |
|------|------|--------------|
| `quote_request` | action | Submits a disability insurance quote-comparison request to the Seaworthy sales pipeline on the user's behalf. A licensed broker follows up within one business day. |
| `get_specialty_guide` | read | Coverage guidance for a specific profession or medical specialty. |
| `compare_carriers` | read | Structured comparison of the five major individual disability carriers. |
| `estimate_benefit_cap_gap` | read | Income-replacement gap math between a group LTD cap and a target. |
| `list_riders` | read | Definitions and trade-offs for the major disability insurance riders. |
| `get_education_article` | read | Retrieves a named education article as structured metadata plus a link. |

### `quote_request` inputs

Required: `first_name`, `last_name`, `email`, `phone`, `profession`, `state`, `dob`, `gender`, `annual_income`.
Optional: `life_insurance_interest`, `notes`, `referral_source`.

The agent must confirm the user has consented to be contacted before calling it. SSN, medical history, and banking details are never collected through this tool.

## Security & privacy

This is a remote, stateless server. Connecting a client runs no code on the user's machine and gives the server no access to the local filesystem.

- **Read tools** return only public, vendor-verified facts.
- **The one write tool** (`quote_request`) is guarded server-side by input validation, per-IP rate limiting, and duplicate suppression, not by client credentials. That is why the endpoint can be open without exposing the pipeline to abuse.
- **No sensitive data** (SSN, medical, banking) is ever accepted, and the agent must confirm consent before submitting.
- **Minimal data flow:** submissions go to Seaworthy's CRM (Salesforce Web-to-Lead) and nowhere else. The server keeps no conversation or query history, and no secrets live in this repository.

Full details and a private disclosure channel are in [SECURITY.md](SECURITY.md).

## Try it

Add `https://mcp.seaworthy.io/mcp` as an MCP server in any MCP-capable client (Cloudflare AI Playground, Claude Desktop, MCP Inspector, or a custom connector), then ask it to get a disability insurance quote.

## Stack

Cloudflare Worker (TypeScript), stateless JSON-RPC over Streamable HTTP. Quote submissions write to Salesforce Web-to-Lead. No secrets live in this repository.

## Author

Built by [Toby Lason](https://seaworthy.io/team/toby-lason/), Managing Partner, Seaworthy Insurance.

## License

MIT (see [LICENSE](LICENSE)). The hosted endpoint at `mcp.seaworthy.io` is the supported way to use it; the code is published for transparency and discoverability.

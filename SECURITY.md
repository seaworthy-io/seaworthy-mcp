# Security Policy

## Reporting a vulnerability

If you find a security issue in this server or in the hosted endpoint at
`mcp.seaworthy.io`, please report it privately through GitHub's
**Report a vulnerability** button on this repository's
[Security tab](https://github.com/seaworthy-io/seaworthy-mcp/security/advisories/new).
Reports land in a private advisory visible only to the maintainers.

Please do not open a public issue for security reports. We aim to acknowledge a
report within two business days and to share a remediation timeline after triage.

## Scope

In scope:

- The hosted MCP endpoint: `https://mcp.seaworthy.io/mcp`
- The worker source in this repository

Out of scope:

- Volumetric or denial-of-service testing against the hosted endpoint. It is
  rate-limited; please do not attempt to exhaust it.
- Findings that require an already-compromised client or operating system.

## Security model

This is a remote, stateless MCP server running on Cloudflare Workers. By design:

- **No local execution.** Connecting a client to the endpoint runs no code on the
  user's machine and gives the server no access to the local filesystem.
- **No credentials required, and none needed.** The read tools return only public,
  vendor-verified facts. The single write tool (`quote_request`) is protected
  server-side by strict input validation, per-IP rate limiting, and duplicate
  suppression rather than by client authentication.
- **No sensitive data collected.** `quote_request` never accepts SSN, medical
  history, or banking details, and the calling agent must confirm user consent
  before submitting.
- **No secrets in this repository.** Credentials live only in the deployment
  environment.
- **Minimal data flow.** Quote submissions are written to Seaworthy's CRM
  (Salesforce Web-to-Lead) and nowhere else. The server keeps no conversation or
  query history.

## Supported version

The hosted endpoint always runs the latest `main`. There is no support commitment
for forks or self-hosted copies.

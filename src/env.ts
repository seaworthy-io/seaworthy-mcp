export interface Env {
  SITE_BASE_URL: string;
  SALESFORCE_WEB_TO_LEAD_URL: string;
  SALESFORCE_ORG_ID?: string;
  // Lead Source picklist API Name posted on field 00N3600000NGrUe.
  // Defaults to "Website - Quote" when unset (see wrangler.toml).
  LEAD_SOURCE?: string;
  // KV store backing spam controls (per-IP rate limiting + duplicate suppression).
  ABUSE_KV: KVNamespace;
  // Verified-knowledge KV (key "mcp-knowledge", generated from CONTENT-TRUTH.md).
  KB?: KVNamespace;
  // GA4 Measurement Protocol (server-side lead key events). Measurement ID is a
  // plain var; the API secret is a wrangler secret. Both absent = silently off.
  GA4_MEASUREMENT_ID?: string;
  GA4_API_SECRET?: string;
}

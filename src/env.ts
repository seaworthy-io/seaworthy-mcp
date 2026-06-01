export interface Env {
  SITE_BASE_URL: string;
  SALESFORCE_WEB_TO_LEAD_URL: string;
  SALESFORCE_ORG_ID?: string;
  // Lead Source picklist API Name posted on field 00N3600000NGrUe.
  // Defaults to "Website - Quote" when unset (see wrangler.toml).
  LEAD_SOURCE?: string;
  // KV store backing spam controls (per-IP rate limiting + duplicate suppression).
  ABUSE_KV: KVNamespace;
}

// Spam / abuse controls for the open quote_request action.
// Three independent layers: strict input validation, per-IP rate limiting,
// and short-window duplicate suppression. None of these require a human in the
// loop, so the agent flow stays zero-touch while junk stays out of Salesforce.

// Ported from the live /quote/ form's client-side validators so the agent path
// enforces the same quality bar the web form does.
const FAKE_LOCALS = new Set([
  'test', 'fake', 'noemail', 'no-email', 'none', 'na', 'spam', 'email', 'asdf',
  'asdfasdf', 'qwerty', 'qwer', 'abc', 'abcdef', 'xxx', 'aaa', 'bbb', 'nobody',
  'unknown', 'sample', 'example', 'fakeemail', 'notreal', 'nothanks'
]);
const FAKE_DOMAINS = new Set([
  'mailinator.com', '10minutemail.com', 'guerrillamail.com', 'trashmail.com',
  'yopmail.com', 'tempmail.com', 'throwaway.email', 'getnada.com', 'maildrop.cc',
  'temp-mail.org', 'dispostable.com', 'sharklasers.com', 'grr.la', 'dropmail.me',
  'test.com', 'fake.com', 'example.com', 'sample.com', 'domain.com', 'email.com',
  'noemail.com'
]);

export function isValidEmailStrict(email: string): boolean {
  if (!/^[a-zA-Z0-9._+%-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,24}$/.test(email)) return false;
  const [local, domain] = email.toLowerCase().split('@');
  if (!local || !domain) return false;
  if (local.length < 2) return false;
  if (/^(.)\1+$/.test(local)) return false;        // aaaa@
  if (FAKE_LOCALS.has(local)) return false;
  if (FAKE_DOMAINS.has(domain)) return false;
  return true;
}

// Returns the 10 NANP digits if valid, else null. Mirrors the form's strict check
// (valid area/exchange, rejects the 555-01xx fictional block, repeats, sequences).
export function normalizePhoneNANP(raw: string): string | null {
  const digits = raw.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, ''); // drop leading country 1
  if (digits.length !== 10) return null;
  const area = digits.slice(0, 3);
  const exch = digits.slice(3, 6);
  const subs = digits.slice(6);
  if (!/^[2-9][0-9]{2}$/.test(area)) return null;
  if (area[1] === '1' && area[2] === '1') return null;
  if (!/^[2-9][0-9]{2}$/.test(exch)) return null;
  if (exch[1] === '1' && exch[2] === '1') return null;
  if (exch === '555' && /^01[0-9]{2}$/.test(subs)) return null; // 555-0100..0199 fictional block
  if (/^(\d)\1{9}$/.test(digits)) return null;                  // all same digit
  if (digits === '1234567890' || digits === '0123456789') return null;
  return digits;
}

export function formatPhone(digits: string): string {
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

// Strict format checks still pass structurally valid but nonexistent domains
// (e.g. a typo'd "gmaiasdfasdfl.com"). A DNS-over-HTTPS lookup confirms the domain
// can actually receive mail (MX, or an A record as fallback). Fails OPEN on any
// DNS error so a transient hiccup never blocks a real applicant.
export async function domainCanReceiveMail(domain: string): Promise<boolean> {
  const q = async (type: 'MX' | 'A'): Promise<any[] | null> => {
    try {
      const resp = await fetch(
        `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=${type}`,
        { headers: { Accept: 'application/dns-json' } }
      );
      if (!resp.ok) return null;
      const data: any = await resp.json();
      return Array.isArray(data?.Answer) ? data.Answer : [];
    } catch {
      return null;
    }
  };
  const mx = await q('MX');
  if (mx === null) return true; // DNS error: fail open
  if (mx.some((a) => a?.type === 15)) return true; // has MX
  const a = await q('A');
  if (a === null) return true; // DNS error: fail open
  return a.some((r) => r?.type === 1); // mail can fall back to the A record
}

// Per-IP fixed-window rate limit. KV is eventually consistent, which is fine for
// spam deterrence (it is one of three layers, not a security boundary).
export async function checkRateLimit(
  kv: KVNamespace,
  ip: string | undefined,
  limit = 8,
  windowMs = 3600_000
): Promise<boolean> {
  if (!ip) return true; // can't identify the caller; validation + dedup still apply
  const bucket = Math.floor(Date.now() / windowMs);
  const key = `rl:q:${ip}:${bucket}`;
  const current = parseInt((await kv.get(key)) || '0', 10);
  if (current >= limit) return false;
  await kv.put(key, String(current + 1), { expirationTtl: Math.ceil((windowMs / 1000) * 2) });
  return true;
}

// True if an identical email was submitted within the dedup window.
export async function isDuplicate(kv: KVNamespace, email: string): Promise<boolean> {
  return (await kv.get(`dup:${email.toLowerCase()}`)) !== null;
}

export async function markSubmitted(kv: KVNamespace, email: string, ttlSec = 600): Promise<void> {
  await kv.put(`dup:${email.toLowerCase()}`, '1', { expirationTtl: ttlSec });
}

// Small URL sanitizer used across auth redirects, external links, and any
// place we accept user- or URL-supplied navigation targets.
//
// - `safeInternalPath` returns a same-origin path (starts with "/") or null.
//   It rejects protocol-relative URLs ("//evil.com"), absolute URLs, and any
//   path pointing back at auth/recovery pages (prevents redirect loops).
// - `safeExternalHref` returns the input only if it uses http(s), mailto, or
//   tel schemes. Everything else (javascript:, data:, vbscript:, file:, ...)
//   returns null so callers can fall back to "#" or omit the link.

const BLOCKED_INTERNAL_PREFIXES = ["/auth", "/reset-password"];

export function safeInternalPath(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  // Must be a same-origin path.
  if (!trimmed.startsWith("/")) return null;
  // Reject protocol-relative ("//host/path") — browsers treat as absolute.
  if (trimmed.startsWith("//")) return null;
  // Reject control chars / whitespace injection.
  if (/[\u0000-\u001F\u007F]/.test(trimmed)) return null;
  // Reject loops back to public auth pages.
  const lower = trimmed.toLowerCase();
  if (
    BLOCKED_INTERNAL_PREFIXES.some(
      (p) => lower === p || lower.startsWith(`${p}?`) || lower.startsWith(`${p}/`),
    )
  ) {
    return null;
  }
  return trimmed;
}

const SAFE_SCHEMES = /^(https?:|mailto:|tel:)/i;

export function safeExternalHref(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) return trimmed;
  if (!SAFE_SCHEMES.test(trimmed)) return null;
  return trimmed;
}

/**
 * Who may sign in. The site holds private family data, so a magic link is
 * only ever sent to, and a session only honoured for, an address listed in
 * AUTH_ALLOWED_EMAILS (comma-separated). Unset or empty means nobody: the
 * site fails closed rather than open.
 *
 * No imports, so the proxy can use it alongside the Node-only Auth.js instance.
 */
export function parseAllowedEmails(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean),
  )
}

export function isEmailAllowed(
  email: string | null | undefined,
  raw: string | undefined = process.env.AUTH_ALLOWED_EMAILS,
): boolean {
  if (!email) return false
  return parseAllowedEmails(raw).has(email.trim().toLowerCase())
}

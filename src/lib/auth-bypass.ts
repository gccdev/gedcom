/**
 * Local-only login bypass, for manual QA when a magic-link round trip is
 * impractical. Kept in its own module with no imports so the edge middleware
 * can use it without pulling in the Node-only Auth.js instance.
 *
 * Three gates, all required:
 *   - AUTH_DEV_BYPASS must be exactly 'true' (opt in, per machine, via .env.local)
 *   - VERCEL must be unset, so a stray env var on the deployed site is inert.
 *     Note `vercel env pull` writes VERCEL="1" into .env.local, which disables
 *     the bypass on that machine until the line is removed.
 *   - the request host must be a loopback address, so the bypass cannot be
 *     reached over the network even if both env gates somehow hold
 *
 * NODE_ENV is deliberately not a gate: the production build is run locally for
 * QA, so it is already 'production' in exactly the case this exists to serve.
 */
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])

export function isAuthBypassed(host: string | null | undefined): boolean {
  if (process.env.AUTH_DEV_BYPASS !== 'true' || process.env.VERCEL) return false
  if (!host) return false
  // Strip a :port suffix, but not the colons inside a bare or bracketed IPv6 host.
  const bare = host.startsWith('[')
    ? host.replace(/\]:\d+$/, ']')
    : host.replace(/:\d+$/, '')
  return LOOPBACK_HOSTS.has(bare.toLowerCase())
}

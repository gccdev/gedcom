/**
 * Local-only login bypass, for manual QA when a magic-link round trip is
 * impractical. Kept in its own module with no imports so the proxy can use it
 * without pulling in the Node-only Auth.js instance.
 *
 * Four gates, all required:
 *   - AUTH_DEV_BYPASS must be exactly 'true' (opt in, per machine, via .env.local)
 *   - VERCEL must be unset, so a stray env var on the deployed site is inert.
 *     Note `vercel env pull` writes VERCEL="1" into .env.local, which disables
 *     the bypass on that machine until the line is removed.
 *   - AUTH_BYPASS_BIND must be exactly 'loopback'. Only the `dev` and `start`
 *     npm scripts set it, and they also pass `-H 127.0.0.1`, so the server is
 *     not listening on the network at all. This is the real network boundary.
 *   - the request host must be a loopback name. The Host header is chosen by
 *     the client, so this is a sanity check only and protects nothing by itself.
 *
 * NODE_ENV is deliberately not a gate: the production build is run locally for
 * QA, so it is already 'production' in exactly the case this exists to serve.
 */
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])

export function isAuthBypassed(host: string | null | undefined): boolean {
  if (process.env.AUTH_DEV_BYPASS !== 'true' || process.env.VERCEL) return false
  if (process.env.AUTH_BYPASS_BIND !== 'loopback') return false
  if (!host) return false
  // Strip a :port suffix, but not the colons inside a bare or bracketed IPv6 host.
  const bare = host.startsWith('[')
    ? host.replace(/\]:\d+$/, ']')
    : host.replace(/:\d+$/, '')
  return LOOPBACK_HOSTS.has(bare.toLowerCase())
}

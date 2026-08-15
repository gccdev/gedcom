/**
 * Local-only login bypass, for manual QA when a magic-link round trip is
 * impractical. Kept in its own module with no imports so the edge middleware
 * can use it without pulling in the Node-only Auth.js instance.
 *
 * Two gates, both required:
 *   - AUTH_DEV_BYPASS must be exactly 'true' (opt in, per machine, via .env.local)
 *   - VERCEL must be unset, so a stray env var on the deployed site is inert
 *
 * NODE_ENV is deliberately not a gate: the production build is run locally for
 * QA, so it is already 'production' in exactly the case this exists to serve.
 */
export function isAuthBypassed(): boolean {
  return process.env.AUTH_DEV_BYPASS === 'true' && !process.env.VERCEL
}

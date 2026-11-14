import type { Session } from 'next-auth'
import { headers } from 'next/headers'
import { auth } from '@auth'
import { isAuthBypassed } from '@/lib/auth-bypass'
import { isEmailAllowed } from '@/lib/allowlist'

const BYPASS_SESSION: Session = {
  user: { name: 'Local QA', email: 'qa@localhost' },
  expires: '9999-12-31T23:59:59.000Z',
}

/**
 * The session for gating pages and route handlers. Identical to `auth()` unless
 * the local-only bypass is active — see `isAuthBypassed` for when that is.
 * A session whose address has since left the allowlist counts as signed out, so
 * removing someone takes effect without waiting for their JWT to expire.
 */
export async function getSession(): Promise<Session | null> {
  if (isAuthBypassed((await headers()).get('host'))) return BYPASS_SESSION
  const session = await auth()
  return session && isEmailAllowed(session.user?.email) ? session : null
}

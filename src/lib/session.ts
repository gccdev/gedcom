import type { Session } from 'next-auth'
import { auth } from '@auth'
import { isAuthBypassed } from '@/lib/auth-bypass'

const BYPASS_SESSION: Session = {
  user: { name: 'Local QA', email: 'qa@localhost' },
  expires: '9999-12-31T23:59:59.000Z',
}

/**
 * The session for gating pages and route handlers. Identical to `auth()` unless
 * the local-only bypass is active — see `isAuthBypassed` for when that is.
 */
export async function getSession(): Promise<Session | null> {
  if (isAuthBypassed()) return BYPASS_SESSION
  return auth()
}

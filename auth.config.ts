import type { NextAuthConfig } from 'next-auth'
import Resend from 'next-auth/providers/resend'
import { isEmailAllowed } from './src/lib/allowlist'

/** How long a magic link stays valid. auth.ts derives its send throttle from this. */
export const MAGIC_LINK_MAX_AGE_SECONDS = 24 * 60 * 60

// Edge-compatible config — no adapter, no Node.js imports
// Used by src/proxy.ts for session cookie verification
export const authConfig: NextAuthConfig = {
  providers: [
    Resend({
      apiKey: process.env.AUTH_RESEND_KEY,
      from: process.env.RESEND_FROM ?? 'Family Tree <onboarding@resend.dev>',
      maxAge: MAGIC_LINK_MAX_AGE_SECONDS,
    }),
  ],
  pages: {
    signIn: '/auth/signin',
    verifyRequest: '/auth/verify',
  },
  callbacks: {
    authorized({ auth }) {
      return !!auth && isEmailAllowed(auth.user?.email)
    },
    // Runs both when a link is requested and when it is followed. Returning
    // false on the request means no email is sent to an unlisted address.
    signIn({ user }) {
      return isEmailAllowed(user.email)
    },
  },
}

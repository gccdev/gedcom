import NextAuth from 'next-auth'
import PostgresAdapter from '@auth/pg-adapter'
import { neonConfig } from '@neondatabase/serverless'
import { pool } from './src/lib/db'
import ws from 'ws'
import { MAGIC_LINK_MAX_AGE_SECONDS, authConfig } from './auth.config'
import { isEmailAllowed } from './src/lib/allowlist'
import { hasRecentSignInEmail } from './src/lib/queries'

/** Minimum gap between magic-link emails to one address. */
const SIGN_IN_EMAIL_COOLDOWN_SECONDS = 60

neonConfig.webSocketConstructor = ws

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PostgresAdapter(pool as any),
  session: { strategy: 'jwt' },
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ user, email }) {
      if (!isEmailAllowed(user.email)) return false
      // Throttle link requests so the form cannot be used to flood an inbox
      // or burn the Resend quota. Following a link is never throttled.
      if (email?.verificationRequest && user.email) {
        const recent = await hasRecentSignInEmail(
          user.email, SIGN_IN_EMAIL_COOLDOWN_SECONDS, MAGIC_LINK_MAX_AGE_SECONDS,
        )
        if (recent) return false
      }
      return true
    },
  },
})

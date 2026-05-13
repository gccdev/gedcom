import type { NextAuthConfig } from 'next-auth'
import Resend from 'next-auth/providers/resend'

// Edge-compatible config — no adapter, no Node.js imports
// Used by middleware for session cookie verification
export const authConfig: NextAuthConfig = {
  providers: [
    Resend({
      apiKey: process.env.AUTH_RESEND_KEY,
      from: process.env.RESEND_FROM ?? 'Family Tree <onboarding@resend.dev>',
    }),
  ],
  pages: {
    signIn: '/auth/signin',
    verifyRequest: '/auth/verify',
  },
  callbacks: {
    authorized({ auth }) {
      return !!auth
    },
  },
}

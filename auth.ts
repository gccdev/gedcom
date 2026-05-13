import NextAuth from 'next-auth'
import PostgresAdapter from '@auth/pg-adapter'
import { neonConfig } from '@neondatabase/serverless'
import { pool } from './src/lib/db'
import Resend from 'next-auth/providers/resend'
import ws from 'ws'

neonConfig.webSocketConstructor = ws

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PostgresAdapter(pool as any),
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
  session: { strategy: 'database' },
})

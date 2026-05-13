import NextAuth from 'next-auth'
import PostgresAdapter from '@auth/pg-adapter'
import { neonConfig } from '@neondatabase/serverless'
import { pool } from './src/lib/db'
import ws from 'ws'
import { authConfig } from './auth.config'

neonConfig.webSocketConstructor = ws

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PostgresAdapter(pool as any),
  session: { strategy: 'jwt' },
})

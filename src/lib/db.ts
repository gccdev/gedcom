import { neon, Pool } from '@neondatabase/serverless'

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set')

// HTTP tagged-template for app queries (fast, stateless, serverless-safe)
export const sql = neon(process.env.DATABASE_URL)

// Connection pool for Auth.js pg-adapter (needs .query() + rowCount)
export const pool = new Pool({ connectionString: process.env.DATABASE_URL })

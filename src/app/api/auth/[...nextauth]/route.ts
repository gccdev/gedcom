import { handlers } from '@auth'

// Force Node.js runtime — auth.ts imports ws and Pool which need Node.js built-ins
export const runtime = 'nodejs'

export const { GET, POST } = handlers

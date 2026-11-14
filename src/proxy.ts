import NextAuth from 'next-auth'
import { authConfig } from '../auth.config'
import { isAuthBypassed } from '@/lib/auth-bypass'

// Providers are dropped here on purpose. Auth.js requires an adapter whenever an
// email provider is configured, and the edge-safe config has none by design — so
// keeping Resend would throw MissingAdapter on every request. Verifying a JWT
// session cookie needs only AUTH_SECRET, not the providers.
const { auth } = NextAuth({ ...authConfig, providers: [] })

export default auth((req) => {
  if (isAuthBypassed(req.nextUrl.hostname)) return

  const isAuthed = !!req.auth
  const isAuthPage = req.nextUrl.pathname.startsWith('/auth')
  const isApi = req.nextUrl.pathname.startsWith('/api')

  if (!isAuthed && !isAuthPage && !isApi) {
    return Response.redirect(new URL('/auth/signin', req.url))
  }
})

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}

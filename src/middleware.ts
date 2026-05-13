import NextAuth from 'next-auth'
import { authConfig } from '../auth.config'

const { auth } = NextAuth(authConfig)

export default auth((req) => {
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

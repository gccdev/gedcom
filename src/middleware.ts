import { auth } from '../auth'
import { NextResponse } from 'next/server'

export default auth((req) => {
  const isAuthed = !!req.auth
  const isAuthPage = req.nextUrl.pathname.startsWith('/auth')
  const isApi = req.nextUrl.pathname.startsWith('/api')

  if (!isAuthed && !isAuthPage && !isApi) {
    return NextResponse.redirect(new URL('/auth/signin', req.url))
  }
})

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}

import { NextRequest, NextResponse } from 'next/server'

/**
 * Middleware roda na Edge Runtime (sem acesso a Node.js crypto).
 * Usa Web Crypto API (crypto.subtle) para derivar o mesmo token que lib/auth.ts.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Protege /admin/*, exceto /admin/login
  if (pathname.startsWith('/admin') && !pathname.startsWith('/admin/login')) {
    const session = request.cookies.get('session')?.value

    if (!session) {
      return NextResponse.redirect(new URL('/admin/login', request.url))
    }

    const password = process.env.ADMIN_PASSWORD ?? 'vet123'
    const secret = process.env.AUTH_SECRET ?? 'mude-esta-chave-secreta-2024'
    const data = new TextEncoder().encode(password + secret)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    const expected = Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')

    if (session !== expected) {
      return NextResponse.redirect(new URL('/admin/login', request.url))
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/admin/:path*'],
}

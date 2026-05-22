import { NextRequest, NextResponse } from 'next/server'
import { parseVetSession } from '@/lib/vet-auth'
import { parseSystemSession } from '@/lib/system-auth'
import { parseClinicaSession } from '@/lib/clinica-auth'

const ADMIN_ONLY = ['/admin/dashboard', '/admin/usuarios', '/admin/comissoes']

// Constrói URL de redirect a partir dos headers do proxy — nextUrl pode retornar localhost em self-hosted
function redir(request: NextRequest, path: string) {
  const proto = request.headers.get('x-forwarded-proto')?.split(',')[0] ?? 'https'
  const host  = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? 'biopetvet.com'
  return NextResponse.redirect(new URL(path, `${proto}://${host}`))
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (pathname === '/admin/login') {
    return redir(request, '/login')
  }

  if (pathname.startsWith('/admin')) {
    const cookie = request.cookies.get('sys_session')?.value
    if (!cookie) return redir(request, '/login')
    const session = await parseSystemSession(cookie)
    if (!session) return redir(request, '/login')
    if (session.primeiraSSenha) return redir(request, '/troca-senha')
    if (ADMIN_ONLY.some(r => pathname.startsWith(r)) && session.role !== 'admin') {
      return redir(request, '/admin/laudos')
    }
  }

  if (pathname.startsWith('/troca-senha')) {
    const cookie = request.cookies.get('sys_session')?.value
    if (!cookie) return redir(request, '/login')
    const session = await parseSystemSession(cookie)
    if (!session) return redir(request, '/login')
  }

  if (
    pathname.startsWith('/vet') &&
    !pathname.startsWith('/vet/login') &&
    !pathname.startsWith('/vet/cadastro') &&
    !pathname.startsWith('/vet/recuperar')
  ) {
    const session = request.cookies.get('vet_session')?.value
    if (!session) return redir(request, '/vet/login')
    const vetId = await parseVetSession(session)
    if (!vetId) return redir(request, '/vet/login')
  }

  if (
    pathname.startsWith('/clinica') &&
    !pathname.startsWith('/clinica/login') &&
    !pathname.startsWith('/clinica/cadastro')
  ) {
    const session = request.cookies.get('clinica_session')?.value
    if (!session) return redir(request, '/clinica/login')
    const data = await parseClinicaSession(session)
    if (!data) return redir(request, '/clinica/login')
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/admin/:path*', '/vet/:path*', '/clinica/:path*', '/troca-senha'],
}

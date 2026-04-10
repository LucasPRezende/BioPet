import { NextRequest, NextResponse } from 'next/server'
import { parseVetSession } from '@/lib/vet-auth'
import { parseSystemSession } from '@/lib/system-auth'
import { parseClinicaSession } from '@/lib/clinica-auth'

// Rotas /admin que exigem role 'admin'
const ADMIN_ONLY = ['/admin/dashboard', '/admin/usuarios', '/admin/comissoes']

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // ── Redireciona /admin/login para /login ──────────────────────────────────
  if (pathname === '/admin/login') {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // ── Rotas /admin/* ────────────────────────────────────────────────────────
  if (pathname.startsWith('/admin')) {
    const cookie = request.cookies.get('sys_session')?.value
    if (!cookie) {
      return NextResponse.redirect(new URL('/login', request.url))
    }
    const session = await parseSystemSession(cookie)
    if (!session) {
      return NextResponse.redirect(new URL('/login', request.url))
    }
    // Troca de senha obrigatória antes de acessar qualquer rota admin
    if (session.primeiraSSenha) {
      return NextResponse.redirect(new URL('/troca-senha', request.url))
    }
    // Rotas exclusivas de admin
    if (ADMIN_ONLY.some(r => pathname.startsWith(r)) && session.role !== 'admin') {
      return NextResponse.redirect(new URL('/admin/laudos', request.url))
    }
  }

  // ── /troca-senha ──────────────────────────────────────────────────────────
  if (pathname.startsWith('/troca-senha')) {
    const cookie = request.cookies.get('sys_session')?.value
    if (!cookie) return NextResponse.redirect(new URL('/login', request.url))
    const session = await parseSystemSession(cookie)
    if (!session) return NextResponse.redirect(new URL('/login', request.url))
  }

  // ── Rotas /vet/* ──────────────────────────────────────────────────────────
  if (
    pathname.startsWith('/vet') &&
    !pathname.startsWith('/vet/login') &&
    !pathname.startsWith('/vet/cadastro') &&
    !pathname.startsWith('/vet/recuperar')
  ) {
    const session = request.cookies.get('vet_session')?.value
    if (!session) {
      return NextResponse.redirect(new URL('/vet/login', request.url))
    }
    const vetId = await parseVetSession(session)
    if (!vetId) {
      return NextResponse.redirect(new URL('/vet/login', request.url))
    }
  }

  // ── Rotas /clinica/* ──────────────────────────────────────────────────────
  if (
    pathname.startsWith('/clinica') &&
    !pathname.startsWith('/clinica/login') &&
    !pathname.startsWith('/clinica/cadastro')
  ) {
    const session = request.cookies.get('clinica_session')?.value
    if (!session) {
      return NextResponse.redirect(new URL('/clinica/login', request.url))
    }
    const data = await parseClinicaSession(session)
    if (!data) {
      return NextResponse.redirect(new URL('/clinica/login', request.url))
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/admin/:path*', '/vet/:path*', '/clinica/:path*', '/troca-senha'],
}

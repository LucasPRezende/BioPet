import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { verifyPassword } from '@/lib/vet-auth'
import { createSystemSession, SESSION_COOKIE_NAME, SESSION_COOKIE_OPTIONS } from '@/lib/system-auth'
import { createClinicaSession, CLINICA_COOKIE_NAME, CLINICA_COOKIE_OPTIONS } from '@/lib/clinica-auth'
import { createVetSession } from '@/lib/vet-auth'

const ERRO_GENERICO = 'E-mail ou senha inválidos.'

export async function POST(request: NextRequest) {
  let body: { email?: string; password?: string }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 })
  }

  const email    = body.email?.toLowerCase().trim()
  const password = body.password?.trim()

  if (!email || !password) {
    return NextResponse.json({ error: 'E-mail e senha são obrigatórios.' }, { status: 400 })
  }

  // ── 1. Usuário do sistema (admin / user) ──────────────────────────────────
  {
    const { data: user } = await supabase
      .from('system_users')
      .select('id, role, senha_hash, ativo, primeira_senha')
      .eq('email', email)
      .single()

    if (user) {
      if (!user.ativo) {
        return NextResponse.json({ error: 'Usuário inativo. Contate o administrador.' }, { status: 403 })
      }
      const ok = await verifyPassword(password, user.senha_hash)
      if (ok) {
        const token    = await createSystemSession(user.id, user.role, user.primeira_senha)
        const redirect = user.primeira_senha
          ? '/troca-senha'
          : user.role === 'admin' ? '/admin/dashboard' : '/admin/laudos'
        const res = NextResponse.json({ redirect })
        res.cookies.set(SESSION_COOKIE_NAME, token, SESSION_COOKIE_OPTIONS)
        return res
      }
      // e-mail bate mas senha errada — falha imediata (evita probing de outros cadastros)
      return NextResponse.json({ error: ERRO_GENERICO }, { status: 401 })
    }
  }

  // ── 2. Clínica parceira ───────────────────────────────────────────────────
  {
    const { data: clinica } = await supabase
      .from('clinicas')
      .select('id, senha_hash, ativo, convite_aceito')
      .eq('email', email)
      .single()

    if (clinica) {
      if (!clinica.ativo) {
        return NextResponse.json({ error: 'Clínica inativa. Entre em contato com a BioPet.' }, { status: 403 })
      }
      const ok = await verifyPassword(password, clinica.senha_hash)
      if (ok) {
        const primeiraSenha = !clinica.convite_aceito
        const token    = await createClinicaSession(clinica.id, primeiraSenha)
        const redirect = primeiraSenha ? '/clinica/perfil?trocar_senha=1' : '/clinica/laudos'
        const res = NextResponse.json({ redirect })
        res.cookies.set(CLINICA_COOKIE_NAME, token, CLINICA_COOKIE_OPTIONS)
        return res
      }
      return NextResponse.json({ error: ERRO_GENERICO }, { status: 401 })
    }
  }

  // ── 3. Veterinário ────────────────────────────────────────────────────────
  {
    const { data: vet } = await supabase
      .from('veterinarios')
      .select('id, senha_hash')
      .eq('email', email)
      .single()

    if (vet?.senha_hash) {
      const ok = await verifyPassword(password, vet.senha_hash)
      if (ok) {
        const token = await createVetSession(vet.id)
        const res   = NextResponse.json({ redirect: '/vet/dashboard' })
        res.cookies.set('vet_session', token, {
          httpOnly: true,
          secure:   process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge:   60 * 60 * 24 * 7,
          path:     '/',
        })
        return res
      }
      return NextResponse.json({ error: ERRO_GENERICO }, { status: 401 })
    }
  }

  return NextResponse.json({ error: ERRO_GENERICO }, { status: 401 })
}

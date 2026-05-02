import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import {
  verifyPassword,
  createClinicaSession,
  CLINICA_COOKIE_NAME,
  CLINICA_COOKIE_OPTIONS,
} from '@/lib/clinica-auth'
import { clearCookieResponse } from '@/lib/session-helpers'

export async function POST(request: NextRequest) {
  const { email, password } = await request.json()

  if (!email || !password) {
    return NextResponse.json({ error: 'E-mail e senha são obrigatórios.' }, { status: 400 })
  }

  const { data: clinica, error } = await supabase
    .from('clinicas')
    .select('id, senha_hash, convite_aceito, ativo')
    .eq('email', email.toLowerCase().trim())
    .single()

  if (error || !clinica || !clinica.senha_hash) {
    return NextResponse.json({ error: 'E-mail ou senha inválidos.' }, { status: 401 })
  }

  if (!clinica.ativo) {
    return NextResponse.json({ error: 'Clínica inativa. Entre em contato com a BioPet.' }, { status: 403 })
  }

  const ok = await verifyPassword(password, clinica.senha_hash)
  if (!ok) {
    return NextResponse.json({ error: 'E-mail ou senha inválidos.' }, { status: 401 })
  }

  // primeira_senha = true quando o convite ainda não foi aceito (senha temporária)
  const primeiraSenha = !clinica.convite_aceito

  const token = await createClinicaSession(clinica.id, primeiraSenha)
  const response = NextResponse.json({ success: true, primeiraSenha })
  response.cookies.set(CLINICA_COOKIE_NAME, token, CLINICA_COOKIE_OPTIONS)
  return response
}

export async function DELETE() {
  return clearCookieResponse(CLINICA_COOKIE_NAME)
}

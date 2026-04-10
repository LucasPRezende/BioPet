import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import {
  hashPassword,
  createClinicaSession,
  CLINICA_COOKIE_NAME,
  CLINICA_COOKIE_OPTIONS,
} from '@/lib/clinica-auth'

export async function POST(request: NextRequest) {
  const { token, password } = await request.json()

  if (!token || !password || password.length < 6) {
    return NextResponse.json(
      { error: 'Token inválido ou senha muito curta (mínimo 6 caracteres).' },
      { status: 400 },
    )
  }

  const { data: clinica, error } = await supabase
    .from('clinicas')
    .select('id, convite_aceito, ativo')
    .eq('token_convite', token)
    .single()

  if (error || !clinica) {
    return NextResponse.json({ error: 'Token inválido ou expirado.' }, { status: 404 })
  }

  if (!clinica.ativo) {
    return NextResponse.json({ error: 'Clínica inativa.' }, { status: 403 })
  }

  if (clinica.convite_aceito) {
    return NextResponse.json({ error: 'Este convite já foi utilizado. Acesse /clinica/login.' }, { status: 400 })
  }

  const senha_hash = await hashPassword(password)

  const { error: updateError } = await supabase
    .from('clinicas')
    .update({ senha_hash, convite_aceito: true })
    .eq('id', clinica.id)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  const sessionToken = await createClinicaSession(clinica.id, false)
  const response = NextResponse.json({ success: true })
  response.cookies.set(CLINICA_COOKIE_NAME, sessionToken, CLINICA_COOKIE_OPTIONS)
  return response
}

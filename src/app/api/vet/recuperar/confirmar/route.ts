import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { hashPassword, createVetSession } from '@/lib/vet-auth'

export async function POST(request: NextRequest) {
  const { token, password } = await request.json()

  if (!token || !password || password.length < 6) {
    return NextResponse.json(
      { error: 'Token inválido ou senha muito curta (mínimo 6 caracteres).' },
      { status: 400 },
    )
  }

  const { data: vet } = await supabase
    .from('veterinarios')
    .select('id')
    .eq('token_convite', token)
    .single()

  if (!vet) {
    return NextResponse.json({ error: 'Link inválido ou expirado.' }, { status: 404 })
  }

  const senha_hash = await hashPassword(password)

  await supabase
    .from('veterinarios')
    .update({
      senha_hash,
      convite_aceito: true,
      token_convite:  null,           // invalida o link após uso
      atualizado_em:  new Date().toISOString(),
    })
    .eq('id', vet.id)

  const sessionToken = await createVetSession(vet.id)
  const response = NextResponse.json({ success: true })
  response.cookies.set('vet_session', sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7,
    path: '/',
  })
  return response
}

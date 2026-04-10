import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { hashPassword, createVetSession } from '@/lib/vet-auth'

export async function POST(request: NextRequest) {
  const { token, email, password } = await request.json()

  if (!token || !email || !password || password.length < 6) {
    return NextResponse.json(
      { error: 'E-mail, token e senha (mínimo 6 caracteres) são obrigatórios.' },
      { status: 400 },
    )
  }

  // Verifica unicidade de e-mail
  const { data: emailExist } = await supabase
    .from('veterinarios')
    .select('id')
    .eq('email', email.trim().toLowerCase())
    .maybeSingle()
  if (emailExist) {
    return NextResponse.json({ error: 'Este e-mail já está em uso.' }, { status: 409 })
  }

  const { data: vet, error } = await supabase
    .from('veterinarios')
    .select('id, convite_aceito')
    .eq('token_convite', token)
    .single()

  if (error || !vet) {
    return NextResponse.json({ error: 'Token inválido ou expirado.' }, { status: 404 })
  }

  if (vet.convite_aceito) {
    return NextResponse.json({ error: 'Este convite já foi utilizado.' }, { status: 400 })
  }

  const senha_hash = await hashPassword(password)

  const { error: updateError } = await supabase
    .from('veterinarios')
    .update({
      email: email.trim().toLowerCase(),
      senha_hash,
      convite_aceito: true,
      atualizado_em: new Date().toISOString(),
    })
    .eq('id', vet.id)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

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

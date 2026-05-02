import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { verifyPassword, createVetSession } from '@/lib/vet-auth'
import { clearCookieResponse } from '@/lib/session-helpers'

export async function POST(request: NextRequest) {
  const { email, password } = await request.json()

  if (!email || !password) {
    return NextResponse.json({ error: 'E-mail e senha são obrigatórios.' }, { status: 400 })
  }

  const { data: vet, error } = await supabase
    .from('veterinarios')
    .select('id, senha_hash, convite_aceito')
    .eq('email', email.toLowerCase().trim())
    .single()

  if (error || !vet || !vet.senha_hash) {
    return NextResponse.json({ error: 'E-mail ou senha inválidos.' }, { status: 401 })
  }

  const ok = await verifyPassword(password, vet.senha_hash)
  if (!ok) {
    return NextResponse.json({ error: 'E-mail ou senha inválidos.' }, { status: 401 })
  }

  const token = await createVetSession(vet.id)
  const response = NextResponse.json({ success: true })
  response.cookies.set('vet_session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7,
    path: '/',
  })
  return response
}

export async function DELETE() {
  return clearCookieResponse('vet_session')
}

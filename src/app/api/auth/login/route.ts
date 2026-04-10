import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { verifyPassword } from '@/lib/vet-auth'
import { createSystemSession, SESSION_COOKIE_NAME, SESSION_COOKIE_OPTIONS } from '@/lib/system-auth'

export async function POST(request: NextRequest) {
  let body: { email?: string; senha?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 })
  }

  const email = body.email?.toLowerCase().trim()
  const senha = body.senha

  if (!email || !senha) {
    return NextResponse.json({ error: 'E-mail e senha são obrigatórios.' }, { status: 400 })
  }

  const { data: user, error } = await supabase
    .from('system_users')
    .select('id, nome, email, senha_hash, role, ativo, primeira_senha')
    .eq('email', email)
    .single()

  if (error || !user) {
    return NextResponse.json({ error: 'E-mail ou senha incorretos.' }, { status: 401 })
  }

  if (!user.ativo) {
    return NextResponse.json({ error: 'Usuário inativo. Contate o administrador.' }, { status: 403 })
  }

  const senhaOk = await verifyPassword(senha, user.senha_hash)
  if (!senhaOk) {
    return NextResponse.json({ error: 'E-mail ou senha incorretos.' }, { status: 401 })
  }

  const sessionToken = await createSystemSession(user.id, user.role, user.primeira_senha)

  const response = NextResponse.json({
    success: true,
    user: {
      id: user.id,
      nome: user.nome,
      email: user.email,
      role: user.role,
      primeira_senha: user.primeira_senha,
    },
  })

  response.cookies.set(SESSION_COOKIE_NAME, sessionToken, SESSION_COOKIE_OPTIONS)
  // Remove cookie legado
  response.cookies.delete('session')

  return response
}

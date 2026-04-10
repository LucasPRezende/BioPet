import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { hashPassword, verifyPassword } from '@/lib/vet-auth'
import {
  parseSystemSession,
  createSystemSession,
  SESSION_COOKIE_NAME,
  SESSION_COOKIE_OPTIONS,
} from '@/lib/system-auth'

export async function POST(request: NextRequest) {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (!cookie) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const session = await parseSystemSession(cookie)
  if (!session) return NextResponse.json({ error: 'Sessão inválida.' }, { status: 401 })

  let body: { senha_atual?: string; nova_senha?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 })
  }

  const { senha_atual, nova_senha } = body

  if (!senha_atual || !nova_senha) {
    return NextResponse.json({ error: 'Preencha todos os campos.' }, { status: 400 })
  }

  if (nova_senha.length < 6) {
    return NextResponse.json({ error: 'A nova senha deve ter ao menos 6 caracteres.' }, { status: 400 })
  }

  const { data: user, error } = await supabase
    .from('system_users')
    .select('id, senha_hash, role, primeira_senha')
    .eq('id', session.userId)
    .single()

  if (error || !user) return NextResponse.json({ error: 'Usuário não encontrado.' }, { status: 404 })

  const senhaOk = await verifyPassword(senha_atual, user.senha_hash)
  if (!senhaOk) {
    return NextResponse.json({ error: 'Senha atual incorreta.' }, { status: 400 })
  }

  const novoHash = await hashPassword(nova_senha)

  const { error: updateError } = await supabase
    .from('system_users')
    .update({ senha_hash: novoHash, primeira_senha: false })
    .eq('id', session.userId)

  if (updateError) {
    return NextResponse.json({ error: 'Erro ao atualizar senha.' }, { status: 500 })
  }

  // Emite nova sessão com primeira_senha = false
  const newToken = await createSystemSession(session.userId, session.role, false)
  const response = NextResponse.json({ success: true })
  response.cookies.set(SESSION_COOKIE_NAME, newToken, SESSION_COOKIE_OPTIONS)

  return response
}

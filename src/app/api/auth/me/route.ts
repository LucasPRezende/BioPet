import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { parseSystemSession, SESSION_COOKIE_NAME } from '@/lib/system-auth'

export async function GET(request: NextRequest) {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (!cookie) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const session = await parseSystemSession(cookie)
  if (!session) return NextResponse.json({ error: 'Sessão inválida.' }, { status: 401 })

  const { data: user, error } = await supabase
    .from('system_users')
    .select('id, nome, email, role, ativo, primeira_senha, permissoes')
    .eq('id', session.userId)
    .single()

  if (error || !user || !user.ativo) {
    return NextResponse.json({ error: 'Usuário não encontrado.' }, { status: 401 })
  }

  return NextResponse.json(user)
}

import { NextRequest, NextResponse } from 'next/server'
import { parseSystemSession, SESSION_COOKIE_NAME } from '@/lib/system-auth'
import { gerarPreferenciaMp } from '@/lib/mp-preference'

export async function POST(request: NextRequest) {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (!cookie) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  const session = await parseSystemSession(cookie)
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  const { agendamento_id } = body ?? {}
  if (!agendamento_id) {
    return NextResponse.json({ error: 'agendamento_id é obrigatório.' }, { status: 400 })
  }

  try {
    const result = await gerarPreferenciaMp(Number(agendamento_id))
    return NextResponse.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro ao gerar preferência.'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

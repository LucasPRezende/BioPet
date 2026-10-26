import { NextRequest, NextResponse } from 'next/server'
import { parseSystemSession, SESSION_COOKIE_NAME } from '@/lib/system-auth'
import { avisoEstoqueAgendamento } from '@/lib/estoque'

// POST { testes_ids, pcrs_ids } — consumíveis que vão faltar se este agendamento
// for criado. Usado pelo formulário de agendamento do painel, só como aviso.
// Qualquer usuário do sistema (a equipe também agenda); devolve só nome e
// quantidade, sem custo.
export async function POST(request: NextRequest) {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (!cookie) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  const session = await parseSystemSession(cookie)
  if (!session) return NextResponse.json({ error: 'Sessão inválida.' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const ids = (v: unknown) => Array.isArray(v) ? v.map(Number).filter(n => Number.isInteger(n) && n > 0) : []

  try {
    const faltas = await avisoEstoqueAgendamento(ids(body?.testes_ids), ids(body?.pcrs_ids))
    return NextResponse.json({ faltas })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erro ao consultar o estoque.' }, { status: 500 })
  }
}

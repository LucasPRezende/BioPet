import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { parseSystemSession, SESSION_COOKIE_NAME } from '@/lib/system-auth'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (!cookie) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const session = await parseSystemSession(cookie)
  if (!session) return NextResponse.json({ error: 'Sessão inválida.' }, { status: 401 })

  const { data, error } = await supabase
    .from('agendamentos')
    .select('*, tutores(id, nome, telefone), pets(id, nome, especie, raca), laudos(id, token)')
    .eq('id', Number(params.id))
    .single()

  if (error || !data) return NextResponse.json({ error: 'Não encontrado.' }, { status: 404 })

  return NextResponse.json(data)
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (!cookie) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const session = await parseSystemSession(cookie)
  if (!session) return NextResponse.json({ error: 'Sessão inválida.' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const { status, observacoes, valor, forma_pagamento } = body ?? {}

  const STATUSES = ['pendente', 'agendado', 'em atendimento', 'concluído', 'cancelado']

  const update: Record<string, unknown> = {}
  if (status !== undefined) {
    if (!STATUSES.includes(status)) return NextResponse.json({ error: 'Status inválido.' }, { status: 400 })
    update.status = status
  }
  if (observacoes   !== undefined) update.observacoes    = observacoes
  if (valor         !== undefined) update.valor          = valor
  if (forma_pagamento !== undefined) update.forma_pagamento = forma_pagamento

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Nenhum campo para atualizar.' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('agendamentos')
    .update(update)
    .eq('id', Number(params.id))
    .select('id, status, observacoes, valor, forma_pagamento')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data)
}

import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { parseSystemSession, SESSION_COOKIE_NAME } from '@/lib/system-auth'
import { transicaoValida } from '@/lib/lab-pedidos'

async function requireAuth(request: NextRequest) {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (!cookie) return null
  return parseSystemSession(cookie)
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth(request)
  if (!session) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const { id } = await params
  const pedidoId = parseInt(id)
  if (isNaN(pedidoId)) return NextResponse.json({ error: 'ID inválido.' }, { status: 400 })

  const { data: pedido, error } = await supabase
    .from('pedido_lab')
    .select('*, tutores(nome, telefone), pets(nome, especie), clinicas(nome), veterinarios(nome), agendamentos(id, data_hora, status), pedido_lab_item(*, lab_laboratorios(nome))')
    .eq('id', pedidoId)
    .single()

  if (error) return NextResponse.json({ error: 'Pedido não encontrado.' }, { status: 404 })
  return NextResponse.json(pedido)
}

// Transições de status + edição de observações/status_pagamento. Cancelamento
// nunca apaga nada — só espelha no agendamento vinculado, se houver.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth(request)
  if (!session) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const { id } = await params
  const pedidoId = parseInt(id)
  if (isNaN(pedidoId)) return NextResponse.json({ error: 'ID inválido.' }, { status: 400 })

  let body: { status?: string; observacoes?: string | null; status_pagamento?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 })
  }

  const { data: atual, error: errAtual } = await supabase
    .from('pedido_lab').select('status, agendamento_id').eq('id', pedidoId).single()
  if (errAtual || !atual) return NextResponse.json({ error: 'Pedido não encontrado.' }, { status: 404 })

  const patch: Record<string, unknown> = {}

  if (body.status !== undefined && body.status !== atual.status) {
    if (!transicaoValida(atual.status, body.status)) {
      return NextResponse.json({ error: `Transição inválida: ${atual.status} → ${body.status}.` }, { status: 400 })
    }
    patch.status = body.status
    if (body.status === 'cancelado' && atual.agendamento_id) {
      await supabase.from('agendamentos').update({ status: 'cancelado' }).eq('id', atual.agendamento_id)
    }
  }
  if (body.observacoes !== undefined) patch.observacoes = body.observacoes?.trim() || null
  if (body.status_pagamento !== undefined) patch.status_pagamento = body.status_pagamento

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nada para atualizar.' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('pedido_lab').update(patch).eq('id', pedidoId).select('*').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

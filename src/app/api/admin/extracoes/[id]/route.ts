import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { parseSystemSession, SESSION_COOKIE_NAME } from '@/lib/system-auth'

async function verificarHemogasometria(agId: number): Promise<boolean> {
  const [{ data: ae }, { data: ag }] = await Promise.all([
    supabase.from('agendamento_exames').select('agendamento_id')
      .eq('agendamento_id', agId).ilike('tipo_exame', '%hemogasometria%').limit(1),
    supabase.from('agendamentos').select('id')
      .eq('id', agId).ilike('tipo_exame', '%hemogasometria%').limit(1),
  ])
  return (ae?.length ?? 0) > 0 || (ag?.length ?? 0) > 0
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (!cookie) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  const session = await parseSystemSession(cookie)
  if (!session || session.role !== 'admin') return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })

  const { id } = await params
  const agId   = parseInt(id)
  if (!agId) return NextResponse.json({ error: 'ID inválido.' }, { status: 400 })

  let body: Record<string, unknown>
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 }) }

  // Garante que o agendamento é de hemogasometria antes de qualquer operação
  const ehHemo = await verificarHemogasometria(agId)
  if (!ehHemo) {
    return NextResponse.json({ error: 'Agendamento não é de hemogasometria.' }, { status: 403 })
  }

  // Atribuir vet de extração
  if ('vet_extracao_id' in body) {
    const vetId = Number(body.vet_extracao_id)
    if (!vetId) return NextResponse.json({ error: 'vet_extracao_id inválido.' }, { status: 400 })

    // Valida que o vet existe
    const { data: vet } = await supabase.from('veterinarios').select('id').eq('id', vetId).single()
    if (!vet) return NextResponse.json({ error: 'Veterinário não encontrado.' }, { status: 404 })

    const { data: comissao } = await supabase
      .from('comissoes_exame')
      .select('valor_comissao')
      .ilike('tipo_exame', '%hemogasometria%')
      .single()

    const valorComissao = comissao?.valor_comissao ?? 0

    const { error } = await supabase
      .from('agendamentos')
      .update({ vet_extracao_id: vetId, comissao_extracao: valorComissao })
      .eq('id', agId)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ sucesso: true, comissao_extracao: valorComissao })
  }

  // Marcar comissão como paga
  if (body.comissao_paga === true) {
    // Valida que já tem vet atribuído antes de marcar como pago
    const { data: ag } = await supabase
      .from('agendamentos').select('vet_extracao_id').eq('id', agId).single()
    if (!ag?.vet_extracao_id) {
      return NextResponse.json({ error: 'Não é possível marcar como pago sem vet de extração atribuído.' }, { status: 400 })
    }

    const { error } = await supabase
      .from('agendamentos')
      .update({ comissao_paga: true, comissao_paga_em: new Date().toISOString() })
      .eq('id', agId)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ sucesso: true })
  }

  return NextResponse.json({ error: 'Nenhuma operação reconhecida.' }, { status: 400 })
}

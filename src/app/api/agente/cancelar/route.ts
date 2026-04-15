import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { verifyAgentKey } from '@/lib/agent-auth'

export async function PATCH(request: NextRequest) {
  if (!verifyAgentKey(request)) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
  }

  const idParam = request.nextUrl.searchParams.get('id')
  const id      = Number(idParam)
  if (!id) {
    return NextResponse.json({ error: 'Parâmetro "id" é obrigatório.' }, { status: 400 })
  }

  const body = await request.json().catch(() => null)
  const { motivo } = body ?? {}

  // Verifica se agendamento existe e não está já cancelado (+ dados do tutor)
  const { data: atual, error: fetchError } = await supabase
    .from('agendamentos')
    .select('id, status, tutores(telefone, nome)')
    .eq('id', id)
    .single()

  if (fetchError || !atual) {
    return NextResponse.json({ error: 'Agendamento não encontrado.' }, { status: 404 })
  }

  if (atual.status === 'cancelado') {
    return NextResponse.json({ error: 'Agendamento já está cancelado.' }, { status: 400 })
  }

  // Cancela o agendamento
  const { error: updateError } = await supabase
    .from('agendamentos')
    .update({ status: 'cancelado' })
    .eq('id', id)

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  // Pega dados do tutor do agendamento
  const tutor = Array.isArray(atual.tutores) ? atual.tutores[0] : atual.tutores as { telefone: string; nome: string } | null

  // Salva log de cancelamento (sem WhatsApp)
  await supabase.from('notificacoes').insert({
    telefone:       tutor?.telefone ?? 'desconhecido',
    nome_tutor:     tutor?.nome ?? null,
    motivo:         motivo ?? 'cancelamento',
    tipo_evento:    'cancelamento',
    agendamento_id: id,
  })

  return NextResponse.json({ sucesso: true })
}

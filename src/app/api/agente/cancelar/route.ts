import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { verifyAgentKey } from '@/lib/agent-auth'
import { normalizeTelefone } from '@/lib/telefone'

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
  const { motivo, telefone } = body ?? {}

  if (!telefone) {
    return NextResponse.json({ error: '"telefone" é obrigatório.' }, { status: 400 })
  }

  // Verifica se agendamento existe e não está já cancelado (+ dados do tutor)
  const { data: atual, error: fetchError } = await supabase
    .from('agendamentos')
    .select('id, status, tutores(telefone, nome)')
    .eq('id', id)
    .single()

  if (fetchError || !atual) {
    return NextResponse.json({ error: 'Agendamento não encontrado.' }, { status: 404 })
  }

  // Posse: o agendamento tem que ser do tutor desta conversa. O telefone vem
  // injetado pelo servidor (nunca do modelo), então impede a IA cancelar o
  // agendamento de OUTRO cliente por ter chutado um id.
  const tutorDono = Array.isArray(atual.tutores) ? atual.tutores[0] : atual.tutores as { telefone: string; nome: string } | null
  const telConversa = normalizeTelefone(String(telefone).replace(/\D/g, ''))
  const telDono = normalizeTelefone((tutorDono?.telefone ?? '').replace(/\D/g, ''))
  if (!telDono || telDono !== telConversa) {
    return NextResponse.json(
      { error: 'Este agendamento não pertence ao tutor desta conversa.', precisa_atendente: true },
      { status: 403 },
    )
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

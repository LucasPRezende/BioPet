import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { verifyAgentKey } from '@/lib/agent-auth'

const DIAS = [
  'domingo', 'segunda-feira', 'terça-feira', 'quarta-feira',
  'quinta-feira', 'sexta-feira', 'sábado',
]

function formatDataHora(isoStr: string): string {
  const [datePart, timePart = '00:00'] = isoStr.split('T')
  const [year, month, day] = datePart.split('-').map(Number)
  const [hour, minute]     = timePart.split(':').map(Number)
  const d = new Date(year, month - 1, day, hour, minute)
  const dd = String(day).padStart(2, '0')
  const mm = String(month).padStart(2, '0')
  const hh = String(hour).padStart(2, '0')
  const minStr = minute > 0 ? `:${String(minute).padStart(2, '0')}` : ''
  return `${DIAS[d.getDay()]}, ${dd}/${mm} às ${hh}h${minStr}`
}

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
  const { nova_data_hora } = body ?? {}

  if (!nova_data_hora) {
    return NextResponse.json({ error: '"nova_data_hora" é obrigatório.' }, { status: 400 })
  }

  // Busca agendamento atual + dados do tutor
  const { data: atual, error: fetchError } = await supabase
    .from('agendamentos')
    .select('id, duracao_minutos, status, tutores(telefone, nome)')
    .eq('id', id)
    .single()

  if (fetchError || !atual) {
    return NextResponse.json({ error: 'Agendamento não encontrado.' }, { status: 404 })
  }

  if (atual.status === 'cancelado') {
    return NextResponse.json({ error: 'Não é possível remarcar um agendamento cancelado.' }, { status: 400 })
  }

  // Verifica conflito de horário (excluindo o próprio agendamento)
  const novaInicio = new Date(nova_data_hora)
  const novaFim    = new Date(novaInicio.getTime() + (atual.duracao_minutos ?? 30) * 60_000)
  const diaStr     = (nova_data_hora as string).split('T')[0]

  const { data: existentes } = await supabase
    .from('agendamentos')
    .select('id, data_hora, duracao_minutos')
    .gte('data_hora', `${diaStr}T00:00:00`)
    .lte('data_hora', `${diaStr}T23:59:59`)
    .neq('status', 'cancelado')
    .neq('id', id)

  const conflito = (existentes ?? []).find(ag => {
    const agInicio = new Date(ag.data_hora)
    const agFim    = new Date(agInicio.getTime() + (ag.duracao_minutos ?? 30) * 60_000)
    return novaInicio < agFim && novaFim > agInicio
  })

  if (conflito) {
    return NextResponse.json(
      { error: 'Já existe um agendamento neste horário.', conflito_id: conflito.id },
      { status: 409 },
    )
  }

  // Atualiza data_hora
  const { error: updateError } = await supabase
    .from('agendamentos')
    .update({ data_hora: nova_data_hora })
    .eq('id', id)

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  // Pega dados do tutor do agendamento
  const tutor = Array.isArray(atual.tutores) ? atual.tutores[0] : atual.tutores as { telefone: string; nome: string } | null

  // Salva log de remarcação (sem WhatsApp)
  await supabase.from('notificacoes').insert({
    telefone:       tutor?.telefone ?? 'desconhecido',
    nome_tutor:     tutor?.nome ?? null,
    motivo:         'remarcacao',
    tipo_evento:    'remarcacao',
    agendamento_id: id,
  })

  return NextResponse.json({ sucesso: true, data_formatada: formatDataHora(nova_data_hora) })
}

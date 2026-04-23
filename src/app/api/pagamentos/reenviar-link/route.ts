import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { parseSystemSession, SESSION_COOKIE_NAME } from '@/lib/system-auth'
import { sendWhatsAppText } from '@/lib/evolution'

function formatDataHora(isoStr: string): string {
  const [datePart, timePart = '00:00'] = isoStr.split('T')
  const [year, month, day] = datePart.split('-').map(Number)
  const [hour, minute]     = timePart.split(':').map(Number)
  const d   = new Date(year, month - 1, day)
  const dd  = String(day).padStart(2, '0')
  const mm  = String(month).padStart(2, '0')
  const hh  = String(hour).padStart(2, '0')
  const min = minute > 0 ? `:${String(minute).padStart(2, '0')}` : ''
  const DIAS = ['dom','seg','ter','qua','qui','sex','sáb']
  return `${DIAS[d.getDay()]}, ${dd}/${mm} às ${hh}h${min}`
}

export async function POST(request: NextRequest) {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (!cookie) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  const session = await parseSystemSession(cookie)
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  const { agendamento_id } = body ?? {}
  if (!agendamento_id) return NextResponse.json({ error: 'agendamento_id obrigatório.' }, { status: 400 })

  const { data: ag } = await supabase
    .from('agendamentos')
    .select('mp_init_point, valor, tipo_exame, data_hora, duracao_minutos, tutores(nome, telefone), pets(nome)')
    .eq('id', Number(agendamento_id))
    .single()

  if (!ag?.mp_init_point) {
    return NextResponse.json({ error: 'Link de pagamento não disponível.' }, { status: 400 })
  }

  const tutor = Array.isArray(ag.tutores)
    ? ag.tutores[0] as { nome: string | null; telefone: string } | null
    : ag.tutores as { nome: string | null; telefone: string } | null
  const petNome = Array.isArray(ag.pets)
    ? (ag.pets[0] as { nome: string })?.nome
    : (ag.pets as { nome: string } | null)?.nome

  if (!tutor?.telefone) {
    return NextResponse.json({ error: 'Telefone do responsável não disponível.' }, { status: 400 })
  }

  const digits  = tutor.telefone.replace(/\D/g, '')
  const tel     = digits.startsWith('55') ? digits : `55${digits}`
  const dataFmt = formatDataHora(ag.data_hora)
  const valor   = ag.valor != null ? Number(ag.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—'

  const msg = [
    `🔔 Lembrete — pagamento pendente`,
    ``,
    `🐾 Pet: ${petNome ?? '—'}`,
    `💉 ${ag.tipo_exame}`,
    `📅 ${dataFmt}`,
    `💰 Total: ${valor}`,
    ``,
    `Para garantir seu horário, efetue o pagamento:`,
    `👉 ${ag.mp_init_point}`,
    ``,
    `Dúvidas? É só chamar! 🐾`,
  ].join('\n')

  await sendWhatsAppText(tel, msg)

  return NextResponse.json({ sucesso: true })
}

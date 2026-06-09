import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { parseSystemSession, SESSION_COOKIE_NAME } from '@/lib/system-auth'
import { sendWhatsAppText } from '@/lib/evolution'

const DIAS_PT = ['domingo','segunda-feira','terça-feira','quarta-feira','quinta-feira','sexta-feira','sábado']

function formatDT(isoStr: string): string {
  const [datePart, timePart = '00:00'] = isoStr.split('T')
  const [year, month, day] = datePart.split('-').map(Number)
  const [hour, minute]     = timePart.split(':').map(Number)
  const d   = new Date(year, month - 1, day, hour, minute)
  const dd  = String(day).padStart(2, '0')
  const mm  = String(month).padStart(2, '0')
  const hh  = String(hour).padStart(2, '0')
  const min = minute > 0 ? `:${String(minute).padStart(2, '0')}` : ''
  return `${DIAS_PT[d.getDay()]}, ${dd}/${mm} às ${hh}h${min}`
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (!cookie) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  const session = await parseSystemSession(cookie)
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })
  }

  const { data: ag } = await supabase
    .from('agendamentos')
    .select('id, tipo_exame, data_hora, valor, mp_init_point, is_revisao, status_pagamento, tutores(nome, telefone), pets(nome)')
    .eq('id', Number(params.id))
    .single()

  if (!ag) return NextResponse.json({ error: 'Agendamento não encontrado.' }, { status: 404 })

  const tutor = Array.isArray(ag.tutores) ? ag.tutores[0] : ag.tutores as { nome: string | null; telefone: string } | null
  const pet   = Array.isArray(ag.pets)    ? ag.pets[0]    : ag.pets    as { nome: string } | null

  if (!tutor?.telefone) return NextResponse.json({ error: 'Tutor sem telefone cadastrado.' }, { status: 422 })

  const digits  = tutor.telefone.replace(/\D/g, '')
  const tel     = digits.startsWith('55') ? digits : `55${digits}`
  const valorFmt = ag.valor != null
    ? Number(ag.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    : null

  const ok = await sendWhatsAppText(tel, [
    ag.is_revisao ? `🔄 *Lembrete de revisão*` : `🔔 *Lembrete de agendamento*`,
    ``,
    `🐾 Pet: *${pet?.nome ?? '—'}*`,
    `  💉 ${ag.tipo_exame}`,
    `📅 ${formatDT(ag.data_hora)}`,
    `📍 BioPet - Volta Redonda`,
    valorFmt ? `💰 Valor: ${valorFmt}` : null,
    ag.mp_init_point && ag.status_pagamento !== 'pago' ? `\nLink de pagamento:\n👉 ${ag.mp_init_point}` : null,
    ``,
    `Dúvidas? É só chamar! 🐾`,
  ].filter(Boolean).join('\n'))

  if (!ok) return NextResponse.json({ error: 'Falha ao enviar mensagem.' }, { status: 502 })
  return NextResponse.json({ ok: true })
}

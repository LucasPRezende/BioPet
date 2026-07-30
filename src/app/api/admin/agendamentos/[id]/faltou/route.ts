import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { parseSystemSession, SESSION_COOKIE_NAME } from '@/lib/system-auth'
import { sendWhatsAppText } from '@/lib/evolution'
import { normalizeTelefone } from '@/lib/telefone'

const DIAS_PT = ['domingo','segunda-feira','terça-feira','quarta-feira','quinta-feira','sexta-feira','sábado']

function formatDT(isoStr: string): string {
  const [datePart, timePart = '00:00'] = isoStr.split('T')
  const [year, month, day] = datePart.split('-').map(Number)
  const [hour, minute]     = timePart.split(':').map(Number)
  const d  = new Date(year, month - 1, day, hour, minute)
  const dd = String(day).padStart(2, '0')
  const mm = String(month).padStart(2, '0')
  const hh = String(hour).padStart(2, '0')
  const mn = minute > 0 ? `:${String(minute).padStart(2, '0')}` : ''
  return `${DIAS_PT[d.getDay()]}, ${dd}/${mm} às ${hh}h${mn}`
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

  const agId = Number(params.id)
  const { data: ag } = await supabase
    .from('agendamentos')
    .select('id, status, status_pagamento, tipo_exame, data_hora, is_revisao, tutores(nome, telefone), pets(nome)')
    .eq('id', agId)
    .single()

  if (!ag) return NextResponse.json({ error: 'Agendamento não encontrado.' }, { status: 404 })
  if (!['agendado', 'em atendimento'].includes(ag.status)) {
    return NextResponse.json({ error: 'Só é possível marcar falta em agendamentos agendados ou em atendimento.' }, { status: 400 })
  }

  // Mesmo tratamento do cancelamento: se já foi pago, vira estorno pendente em
  // vez de simplesmente fechar — alguém precisa devolver o dinheiro ao tutor.
  const novoStatusPagamento = ag.status_pagamento === 'pago' ? 'estorno_pendente' : 'cancelado'

  const { error } = await supabase
    .from('agendamentos')
    .update({ status: 'faltou', status_pagamento: novoStatusPagamento })
    .eq('id', agId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // A revisão gratuita é de mão única: se este agendamento É a revisão, a falta
  // consome o direito (já foi a chance usada). Se é o exame ORIGINAL, só perde o
  // direito se o tipo de exame permitir revisão (revisao_config).
  let perdeuRevisao = false
  if (ag.is_revisao) {
    perdeuRevisao = true
  } else {
    const tipos = ag.tipo_exame.split(',').map((t: string) => t.trim())
    const { data: config } = await supabase
      .from('revisao_config')
      .select('tipo_exame')
      .in('tipo_exame', tipos)
      .eq('permite_revisao', true)
      .limit(1)
      .maybeSingle()
    perdeuRevisao = !!config
  }

  const tutor = Array.isArray(ag.tutores) ? ag.tutores[0] : ag.tutores as { nome: string | null; telefone: string } | null
  const pet   = Array.isArray(ag.pets)    ? ag.pets[0]    : ag.pets    as { nome: string } | null

  if (tutor?.telefone) {
    const digits = tutor.telefone.replace(/\D/g, '')
    const tel    = normalizeTelefone(digits)
    const msg = [
      `😕 *Sentimos sua falta!*`,
      ``,
      `🐾 Pet: ${pet?.nome ?? '—'}`,
      `  💉 ${ag.tipo_exame}`,
      `📅 ${formatDT(ag.data_hora)}`,
      ``,
      ag.is_revisao
        ? `Não identificamos o comparecimento no horário da sua revisão, então marcamos como não compareceu em nosso sistema.`
        : `Não identificamos o comparecimento no horário agendado, então marcamos como não compareceu em nosso sistema.`,
      // O aviso de "perdeu o direito" só faz sentido pra quem faltou na PRÓPRIA
      // revisão (já era a chance gratuita). Faltar no exame original não leva
      // essa observação — o exame em si ainda pode ser remarcado normalmente.
      ag.is_revisao
        ? `Como a revisão gratuita é condicionada ao comparecimento, esse direito já foi utilizado e não será possível reagendar uma nova revisão sem custo.`
        : null,
      ``,
      ag.is_revisao
        ? `Dúvidas? É só chamar! 🐾`
        : `Se quiser reagendar, é só chamar! 🐾`,
    ].filter(Boolean).join('\n')
    await sendWhatsAppText(tel, msg)
  }

  return NextResponse.json({ sucesso: true, perdeu_revisao: perdeuRevisao, status_pagamento: novoStatusPagamento })
}

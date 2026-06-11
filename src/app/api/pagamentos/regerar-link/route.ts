import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { parseSystemSession, SESSION_COOKIE_NAME } from '@/lib/system-auth'
import { sendWhatsAppText } from '@/lib/evolution'
import { gerarPreferenciaMp } from '@/lib/mp-preference'
import { gerarPixToken } from '@/lib/pix-token'

async function expirarPreferenciaMp(preferenceId: string) {
  try {
    await fetch(`https://api.mercadopago.com/checkout/preferences/${preferenceId}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${(process.env.MP_ACCESS_TOKEN ?? '').trim()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ expires: true, expiration_date_to: new Date(Date.now() - 1000).toISOString() }),
    })
  } catch (err) {
    console.warn('[regerar-link] falha ao expirar preferência MP:', err)
  }
}

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

// Regenera o link de pagamento (PIX ou cartão) com o valor/forma atuais e envia via WhatsApp
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
    .select('id, tipo_exame, valor, forma_pagamento, status_pagamento, data_hora, pix_token, mp_preference_id, tutores(nome, telefone), pets(nome)')
    .eq('id', Number(agendamento_id))
    .single()

  if (!ag) return NextResponse.json({ error: 'Agendamento não encontrado.' }, { status: 404 })
  if (ag.status_pagamento === 'pago') {
    return NextResponse.json({ error: 'Agendamento já está pago — não é possível enviar link de pagamento.' }, { status: 400 })
  }
  if ((ag.forma_pagamento ?? '').toLowerCase() === 'gratuito' || Number(ag.valor ?? 0) === 0) {
    return NextResponse.json({ error: 'Exame gratuito — link de pagamento não aplicável.' }, { status: 400 })
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
  const valorFmt = ag.valor != null
    ? Number(ag.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    : '—'
  const forma = (ag.forma_pagamento ?? '').toLowerCase()

  let link: string

  if (forma.includes('pix')) {
    // Expira preferência MP anterior para que o link de cartão pare de funcionar
    if (ag.mp_preference_id) {
      await expirarPreferenciaMp(ag.mp_preference_id)
      await supabase
        .from('agendamentos')
        .update({ mp_preference_id: null, mp_init_point: null })
        .eq('id', Number(agendamento_id))
    }

    let pixToken = ag.pix_token
    if (!pixToken) {
      // Agendamento criado originalmente como cartão — gera token PIX agora
      pixToken = gerarPixToken()
      await supabase
        .from('agendamentos')
        .update({ pix_token: pixToken })
        .eq('id', Number(agendamento_id))
    }
    link = `${process.env.NEXT_PUBLIC_URL}/pagamento/pix/${pixToken}`
  } else {
    try {
      const result = await gerarPreferenciaMp(Number(agendamento_id))
      link = result.init_point
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao gerar link de pagamento.'
      return NextResponse.json({ error: msg }, { status: 500 })
    }
  }

  const msg = [
    `🔔 Link de pagamento atualizado`,
    ``,
    `🐾 Pet: ${petNome ?? '—'}`,
    `💉 ${ag.tipo_exame}`,
    `📅 ${dataFmt}`,
    `💰 Total: ${valorFmt}`,
    ``,
    `Seu link de pagamento foi atualizado:`,
    `👉 ${link}`,
    ``,
    `Dúvidas? É só chamar! 🐾`,
  ].join('\n')

  await sendWhatsAppText(tel, msg)

  return NextResponse.json({ sucesso: true })
}

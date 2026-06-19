import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { isPixTokenValido } from '@/lib/pix-token'

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const { pix_token, cpf, device_id } = body ?? {}

  if (!pix_token || !cpf) {
    return NextResponse.json({ error: 'Token e CPF obrigatórios.' }, { status: 400 })
  }

  // Valida formato UUID antes de qualquer consulta ao banco
  if (!isPixTokenValido(String(pix_token))) {
    return NextResponse.json({ error: 'Link de pagamento inválido.' }, { status: 403 })
  }

  const cpfClean = String(cpf).replace(/\D/g, '')
  if (cpfClean.length !== 11) {
    return NextResponse.json({ error: 'CPF inválido.' }, { status: 400 })
  }

  const { data: ag } = await supabase
    .from('agendamentos')
    .select('id, tipo_exame, valor, data_hora, status_pagamento, forma_pagamento, entrega_pagamento, pets(nome), tutores(nome)')
    .eq('pix_token', String(pix_token))
    .single()

  if (!ag) return NextResponse.json({ error: 'Link de pagamento inválido.' }, { status: 404 })
  if (ag.status_pagamento === 'pago') return NextResponse.json({ error: 'Pagamento já confirmado.' }, { status: 400 })

  // Valida forma de pagamento e entrega
  const forma   = (ag.forma_pagamento ?? '').toLowerCase()
  const entrega = (ag.entrega_pagamento ?? '').toLowerCase()
  if (!forma.includes('pix') || entrega !== 'link') {
    return NextResponse.json({ error: 'Este agendamento não é elegível para pagamento PIX online.' }, { status: 400 })
  }

  const statusValido = ['pendente', 'a_receber', 'agendado'].includes(ag.status_pagamento ?? '')
  if (!statusValido) {
    return NextResponse.json({ error: 'Este agendamento não está disponível para pagamento.' }, { status: 400 })
  }

  const petNome = Array.isArray(ag.pets)
    ? (ag.pets[0] as { nome: string })?.nome
    : (ag.pets as { nome: string } | null)?.nome

  const tutorNome = Array.isArray(ag.tutores)
    ? (ag.tutores[0] as { nome: string | null })?.nome
    : (ag.tutores as { nome: string | null } | null)?.nome

  const nomeParts = (tutorNome ?? '').trim().split(' ')
  const firstName = nomeParts[0] || 'Cliente'
  const lastName  = nomeParts.slice(1).join(' ') || 'BioPet'

  // Invariante (Fase 2): ag.valor == soma(agendamento_exames.valor).
  const valor = Number(ag.valor) || 0

  const agDate    = new Date(ag.data_hora)
  const now       = new Date()
  const expiresAt = agDate > now ? agDate : new Date(now.getTime() + 24 * 60 * 60 * 1000)
  const dateOfExpiration = expiresAt.toISOString().slice(0, 19) + '.000-03:00'

  const idempotencyKey = `biopet-pix-${ag.id}-${cpfClean.slice(-4)}-${Date.now()}`

  const headers: Record<string, string> = {
    'Authorization':    `Bearer ${(process.env.MP_ACCESS_TOKEN ?? '').trim()}`,
    'Content-Type':     'application/json',
    'X-Idempotency-Key': idempotencyKey,
  }
  // Vincula fingerprint do SDK frontend ao pagamento (requisito qualidade MP)
  if (device_id) headers['X-meli-session-id'] = String(device_id)

  const mpRes = await fetch('https://api.mercadopago.com/v1/payments', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      transaction_amount:   valor,
      payment_method_id:    'pix',
      statement_descriptor: 'BioPet Vet',
      payer: {
        email:      `agendamento${ag.id}@biopet.com.br`,
        first_name: firstName,
        last_name:  lastName,
        identification: { type: 'CPF', number: cpfClean },
      },
      additional_info: {
        items: [{
          id:          `ag-${ag.id}`,
          title:       ag.tipo_exame,
          description: `Exame veterinário — ${petNome ?? 'Pet'}`,
          quantity:    1,
          unit_price:  valor,
        }],
        payer: {
          first_name: firstName,
          last_name:  lastName,
        },
      },
      description:        `BioPet — ${ag.tipo_exame} — ${petNome ?? ''}`,
      external_reference: `biopet-agendamento-${ag.id}`,
      notification_url:   `${process.env.NEXT_PUBLIC_URL}/api/pagamentos/webhook`,
      date_of_expiration: dateOfExpiration,
    }),
  })

  const mpData = await mpRes.json()

  if (!mpRes.ok || mpData.error) {
    console.error('[criar-pix] MP error:', JSON.stringify(mpData))
    return NextResponse.json({ error: mpData.message ?? 'Erro ao gerar PIX.' }, { status: 500 })
  }

  const txData = mpData.point_of_interaction?.transaction_data
  if (!txData?.qr_code) {
    return NextResponse.json({ error: 'PIX indisponível no momento.' }, { status: 500 })
  }

  await supabase
    .from('agendamentos')
    .update({ mp_preference_id: String(mpData.id), status_pagamento: 'a_receber' })
    .eq('id', ag.id)

  return NextResponse.json({
    payment_id:     mpData.id,
    qr_code:        txData.qr_code,
    qr_code_base64: txData.qr_code_base64,
    valor,
  })
}

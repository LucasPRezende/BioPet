import { MercadoPagoConfig, Preference } from 'mercadopago'
import { supabase } from './supabase'

const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN! })

export async function gerarPreferenciaMp(agendamentoId: number): Promise<{
  init_point: string
  preference_id: string
}> {
  const { data: ag } = await supabase
    .from('agendamentos')
    .select('id, tipo_exame, valor, forma_pagamento, pets(nome)')
    .eq('id', agendamentoId)
    .single()

  if (!ag) throw new Error('Agendamento não encontrado')

  const { data: examesRows } = await supabase
    .from('agendamento_exames')
    .select('id, tipo_exame, valor')
    .eq('agendamento_id', agendamentoId)

  const petNome: string =
    (Array.isArray(ag.pets) ? ag.pets[0]?.nome : (ag.pets as { nome: string } | null)?.nome) ?? '—'

  const items =
    examesRows && examesRows.length > 0
      ? examesRows.map(e => ({
          id:          `exame-${e.id}`,
          title:       `BioPet — ${e.tipo_exame} — ${petNome}`,
          quantity:    1,
          unit_price:  Number(e.valor),
          currency_id: 'BRL',
        }))
      : [
          {
            id:          `ag-${ag.id}`,
            title:       `BioPet — ${ag.tipo_exame} — ${petNome}`,
            quantity:    1,
            unit_price:  Number(ag.valor) || 0,
            currency_id: 'BRL',
          },
        ]

  // Para cartão: limita parcelas a 3x. Para pix/débito: sem restrição (MP já exibe PIX em destaque)
  const formaPag = (ag.forma_pagamento ?? '').toLowerCase()
  let paymentMethods: Record<string, unknown> | undefined

  if (formaPag === 'cartao' || formaPag === 'cartao_3x') {
    paymentMethods = {
      installments:        3,
      default_installments: 3,
    }
  }

  const preference = await new Preference(client).create({
    body: {
      items,
      external_reference: `biopet-agendamento-${agendamentoId}`,
      notification_url:   `${process.env.NEXT_PUBLIC_URL}/api/pagamentos/webhook`,
      back_urls: {
        success: `${process.env.NEXT_PUBLIC_URL}/pagamento/sucesso`,
        failure: `${process.env.NEXT_PUBLIC_URL}/pagamento/falha`,
        pending: `${process.env.NEXT_PUBLIC_URL}/pagamento/pendente`,
      },
      auto_return:          'approved',
      statement_descriptor: 'BIOPET VET',
      ...(paymentMethods ? { payment_methods: paymentMethods } : {}),
    },
  })

  await supabase
    .from('agendamentos')
    .update({
      mp_preference_id: preference.id,
      mp_init_point:    preference.init_point,
      status_pagamento: 'a_receber',
    })
    .eq('id', agendamentoId)

  return {
    init_point:    preference.init_point ?? '',
    preference_id: preference.id         ?? '',
  }
}

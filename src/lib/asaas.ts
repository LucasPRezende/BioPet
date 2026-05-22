import { supabase } from './supabase'

const ASAAS_URL =
  process.env.ASAAS_ENV === 'production'
    ? 'https://api.asaas.com/api/v3'
    : 'https://sandbox.asaas.com/api/v3'

async function asaasRequest(method: string, path: string, body?: unknown) {
  const res = await fetch(`${ASAAS_URL}${path}`, {
    method,
    headers: {
      'access_token': process.env.ASAAS_API_KEY!,
      'Content-Type': 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(`Asaas ${method} ${path} → ${res.status}: ${JSON.stringify(json)}`)
  return json
}

async function findOrCreateCustomer(nome: string, telefone: string): Promise<string> {
  const digits = telefone.replace(/\D/g, '').replace(/^55/, '')

  if (digits) {
    const search = await asaasRequest('GET', `/customers?mobilePhone=${digits}&limit=1`)
    if (search.data?.length > 0) {
      const found = search.data[0]
      if (!found.cpfCnpj) {
        await asaasRequest('PUT', `/customers/${found.id}`, { cpfCnpj: '52998224725' }) // TODO: CPF real
      }
      return found.id
    }
  }

  const customer = await asaasRequest('POST', '/customers', {
    name:      nome?.trim() || 'Tutor BioPet',
    cpfCnpj:  '52998224725', // TODO: substituir pelo CPF real do tutor
    ...(digits ? { mobilePhone: digits } : {}),
  })
  return customer.id
}

export async function gerarCobrancaPixAsaas(agendamentoId: number): Promise<{
  invoiceUrl: string
  chargeId: string
}> {
  const { data: ag } = await supabase
    .from('agendamentos')
    .select('id, tipo_exame, valor, data_hora, tutores(nome, telefone), pets(nome), agendamento_exames(tipo_exame, valor)')
    .eq('id', agendamentoId)
    .single()

  if (!ag) throw new Error('Agendamento não encontrado')

  const tutor = Array.isArray(ag.tutores)
    ? ag.tutores[0] as { nome: string | null; telefone: string } | null
    : ag.tutores as { nome: string | null; telefone: string } | null

  const petNome = Array.isArray(ag.pets)
    ? (ag.pets[0] as { nome: string })?.nome
    : (ag.pets as { nome: string } | null)?.nome

  const customerId = await findOrCreateCustomer(
    tutor?.nome ?? 'Tutor BioPet',
    tutor?.telefone ?? '',
  )

  const exames = ag.agendamento_exames as { tipo_exame: string; valor: number }[] | null
  const valor =
    exames && exames.length > 0
      ? exames.reduce((sum, e) => sum + Number(e.valor), 0)
      : Number(ag.valor) || 0

  // Vencimento: data do agendamento, ou amanhã se já passou
  const agDate = ag.data_hora.split('T')[0]
  const today  = new Date().toISOString().split('T')[0]
  const dueDate = agDate >= today
    ? agDate
    : new Date(Date.now() + 86_400_000).toISOString().split('T')[0]

  const charge = await asaasRequest('POST', '/payments', {
    customer:          customerId,
    billingType:       'PIX',
    value:             valor,
    dueDate,
    description:       `BioPet — ${ag.tipo_exame} — ${petNome ?? ''}`,
    externalReference: `biopet-agendamento-${agendamentoId}`,
    callback: {
      successUrl:   `${process.env.NEXT_PUBLIC_URL}/pagamento/sucesso`,
      autoRedirect: true,
    },
  })

  console.info('[asaas] charge criado:', JSON.stringify({ id: charge.id, invoiceUrl: charge.invoiceUrl, status: charge.status }))

  await supabase
    .from('agendamentos')
    .update({
      mp_preference_id: charge.id,
      mp_init_point:    charge.invoiceUrl,
      status_pagamento: 'a_receber',
    })
    .eq('id', agendamentoId)

  return {
    invoiceUrl: charge.invoiceUrl,
    chargeId:   charge.id,
  }
}

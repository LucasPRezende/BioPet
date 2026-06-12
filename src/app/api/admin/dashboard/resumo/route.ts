import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { parseSystemSession, SESSION_COOKIE_NAME } from '@/lib/system-auth'

export async function GET(request: NextRequest) {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (!cookie) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  const session = await parseSystemSession(cookie)
  if (!session || session.role !== 'admin') return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })

  const params = request.nextUrl.searchParams
  const inicio = params.get('inicio')
  const fim    = params.get('fim')
  if (!inicio || !fim) return NextResponse.json({ error: 'inicio e fim são obrigatórios.' }, { status: 400 })

  const hoje = new Date().toLocaleDateString('en-CA')

  const { data: ags, error } = await supabase
    .from('agendamentos')
    .select('id, valor, status_pagamento, pagamento_responsavel, clinica_id, forma_pagamento, entrega_pagamento, data_hora, status, agendamento_exames(desconto)')
    .gte('data_hora', `${inicio}T00:00:00`)
    .lte('data_hora', `${fim}T23:59:59`)
    .neq('status', 'cancelado')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const all = ags ?? []
  const sum = (list: typeof all) => list.reduce((s, r) => s + Number(r.valor ?? 0), 0)

  // Total de descontos concedidos no período (soma agendamento_exames.desconto)
  const totalDescontos = all.reduce((s, r) => {
    const exames = r.agendamento_exames as { desconto: number | null }[] | null
    return s + (exames ?? []).reduce((sx, e) => sx + Number(e.desconto ?? 0), 0)
  }, 0)

  const recebidos      = all.filter(r => r.status_pagamento === 'pago' || r.status_pagamento === 'pago_clinica')
  const aReceberList   = all.filter(r => r.status_pagamento === 'a_receber' || r.status_pagamento === 'pendente')
  const gratuitos      = all.filter(r => r.forma_pagamento === 'gratuito')
  const antecipados    = recebidos.filter(r => r.data_hora.slice(0, 10) > hoje)

  // Breakdown por método de pagamento — recebidos
  const pixPresencialRec    = sum(recebidos.filter(r => r.forma_pagamento === 'pix'    && r.entrega_pagamento === 'presencial'))
  const pixLinkRec          = sum(recebidos.filter(r => r.forma_pagamento === 'pix'    && r.entrega_pagamento === 'link'))
  const cartaoPresencialRec = sum(recebidos.filter(r => r.forma_pagamento === 'cartao' && r.entrega_pagamento === 'presencial'))
  const cartaoLinkRec       = sum(recebidos.filter(r => r.forma_pagamento === 'cartao' && r.entrega_pagamento === 'link'))
  const clinicaRec          = sum(all.filter(r => r.status_pagamento === 'pago_clinica'))

  // A receber por origem
  const aReceberTutorPresencial = sum(aReceberList.filter(r =>
    r.pagamento_responsavel !== 'clinica' && r.entrega_pagamento === 'presencial'
  ))
  const aReceberTutorLink = sum(aReceberList.filter(r =>
    r.pagamento_responsavel !== 'clinica' && (r.entrega_pagamento === 'link' || r.status_pagamento === 'pendente')
  ))
  const aReceberClinica = sum(aReceberList.filter(r =>
    r.pagamento_responsavel === 'clinica'
  ))

  // Agendamentos por dia (para gráfico)
  const porDiaMap: Record<string, number> = {}
  for (const ag of all) {
    const dia = ag.data_hora.slice(0, 10)
    porDiaMap[dia] = (porDiaMap[dia] ?? 0) + 1
  }
  const porDia = Object.entries(porDiaMap)
    .map(([data, quantidade]) => ({ data, quantidade }))
    .sort((a, b) => a.data.localeCompare(b.data))

  return NextResponse.json({
    total_agendamentos:  all.length,
    receita_total:       sum(all),
    total_descontos:     totalDescontos,
    total_recebido:      sum(recebidos),
    total_a_receber:     sum(aReceberList),
    total_gratuitos:     gratuitos.length,
    valor_gratuitos:     sum(gratuitos),
    total_antecipados:   antecipados.length,
    valor_antecipados:   sum(antecipados),
    breakdown: {
      pix_presencial_rec:    pixPresencialRec,
      pix_link_rec:          pixLinkRec,
      cartao_presencial_rec: cartaoPresencialRec,
      cartao_link_rec:       cartaoLinkRec,
      clinica_rec:           clinicaRec,
      a_receber_presencial:  aReceberTutorPresencial,
      a_receber_link:        aReceberTutorLink,
      a_receber_clinica:     aReceberClinica,
    },
    porDia,
  })
}

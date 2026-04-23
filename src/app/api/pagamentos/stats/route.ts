import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { parseSystemSession, SESSION_COOKIE_NAME } from '@/lib/system-auth'

export async function GET(request: NextRequest) {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (!cookie) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  const session = await parseSystemSession(cookie)
  if (!session) return NextResponse.json({ error: 'Sessão inválida.' }, { status: 401 })

  const params = request.nextUrl.searchParams
  const inicio = params.get('inicio') ?? new Date().toLocaleDateString('en-CA')
  const fim    = params.get('fim')    ?? new Date().toLocaleDateString('en-CA')
  const hoje   = new Date().toLocaleDateString('en-CA')

  const { data: rows } = await supabase
    .from('agendamentos')
    .select('valor, status_pagamento, pagamento_responsavel, clinica_id, pago_em')
    .gte('data_hora', `${inicio}T00:00:00`)
    .lte('data_hora', `${fim}T23:59:59`)
    .neq('status', 'cancelado')

  const { data: rowsHoje } = await supabase
    .from('agendamentos')
    .select('valor, status_pagamento, pago_em')
    .eq('status_pagamento', 'pago')
    .gte('pago_em', `${hoje}T00:00:00`)
    .lte('pago_em', `${hoje}T23:59:59`)

  const sum = (list: { valor: number | null }[]) =>
    list.reduce((acc, r) => acc + (r.valor ?? 0), 0)

  const all = rows ?? []

  // Clínica pendente: só aparece depois que o admin confirmou o agendamento (a_receber)
  // Enquanto status_pagamento = 'pendente', o agendamento ainda não foi confirmado pelo admin
  const clinicaPendente = all.filter(r =>
    r.status_pagamento === 'a_receber' && (r.clinica_id != null || r.pagamento_responsavel === 'clinica')
  )

  // Link pendente: tutor deve pagar via MP (sem clinica_id, não é clinica responsável)
  const linkPendente = all.filter(r =>
    r.status_pagamento === 'pendente' && r.clinica_id == null
  )

  // Presencial pendente: tutor paga presencialmente, não clínica
  const presencialPendente = all.filter(r =>
    r.status_pagamento === 'a_receber' &&
    r.clinica_id == null &&
    r.pagamento_responsavel !== 'clinica'
  )

  const clinicaRecebido = all.filter(r => r.status_pagamento === 'pago_clinica')
  const pagoPeriodo     = all.filter(r => r.status_pagamento === 'pago')

  return NextResponse.json({
    link_pendente:        sum(linkPendente),
    presencial_pendente:  sum(presencialPendente),
    clinica_pendente:     sum(clinicaPendente),
    clinica_recebido:     sum(clinicaRecebido),
    pago_periodo:         sum(pagoPeriodo),
    recebido_hoje:        sum(rowsHoje ?? []),
  })
}

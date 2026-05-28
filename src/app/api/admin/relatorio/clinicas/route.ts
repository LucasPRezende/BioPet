import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { parseSystemSession, SESSION_COOKIE_NAME } from '@/lib/system-auth'

export async function GET(request: NextRequest) {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (!cookie) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  const session = await parseSystemSession(cookie)
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })
  }

  const params = request.nextUrl.searchParams
  const inicio = params.get('inicio') ?? new Date().toLocaleDateString('en-CA')
  const fim    = params.get('fim')    ?? new Date().toLocaleDateString('en-CA')

  const { data, error } = await supabase
    .from('agendamentos')
    .select('id, clinica_id, valor, status_pagamento, tipo_exame, data_hora, pagamento_responsavel, repasse_confirmado, repasse_em, clinicas(nome), pets(nome), tutores(nome)')
    .not('clinica_id', 'is', null)
    .neq('status', 'cancelado')
    .gte('data_hora', `${inicio}T00:00:00`)
    .lte('data_hora', `${fim}T23:59:59`)
    .order('data_hora', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Agrupa por clínica
  const map: Record<number, {
    clinica_id:      number
    clinica_nome:    string
    total:           number
    total_valor:     number
    a_receber:       number
    recebido:        number
    repasse_pendente: number
    pendente_mp:     number
    agendamentos: {
      id:                   number
      tipo_exame:           string
      data_hora:            string
      valor:                number | null
      status_pagamento:     string
      pet_nome:             string
      tutor_nome:           string
      pagamento_responsavel: string | null
      repasse_confirmado:   boolean
      repasse_em:           string | null
    }[]
  }> = {}

  for (const ag of data ?? []) {
    const cid      = ag.clinica_id as number
    const nome     = (Array.isArray(ag.clinicas) ? ag.clinicas[0] : ag.clinicas as { nome: string } | null)?.nome ?? 'Clínica sem nome'
    const valor    = ag.valor ?? 0
    const petNome  = (Array.isArray(ag.pets)    ? ag.pets[0]    : ag.pets    as { nome: string } | null)?.nome ?? '—'
    const tutNome  = (Array.isArray(ag.tutores) ? ag.tutores[0] : ag.tutores as { nome: string } | null)?.nome ?? '—'

    if (!map[cid]) {
      map[cid] = { clinica_id: cid, clinica_nome: nome, total: 0, total_valor: 0, a_receber: 0, recebido: 0, repasse_pendente: 0, pendente_mp: 0, agendamentos: [] }
    }

    map[cid].total++
    map[cid].total_valor += valor

    const isRepasseClinica = ag.pagamento_responsavel === 'clinica'

    if (isRepasseClinica && ag.status_pagamento === 'a_receber')    map[cid].a_receber   += valor
    if (ag.status_pagamento === 'pago_clinica')                      map[cid].recebido    += valor
    if (isRepasseClinica && ag.status_pagamento === 'pendente')      map[cid].pendente_mp += valor

    if (isRepasseClinica && ag.status_pagamento === 'a_receber' && !ag.repasse_confirmado) {
      map[cid].repasse_pendente += valor
    }

    map[cid].agendamentos.push({
      id:                   ag.id as number,
      tipo_exame:           ag.tipo_exame,
      data_hora:            ag.data_hora,
      valor:                ag.valor,
      status_pagamento:     ag.status_pagamento,
      pet_nome:             petNome,
      tutor_nome:           tutNome,
      pagamento_responsavel: ag.pagamento_responsavel as string | null,
      repasse_confirmado:   (ag.repasse_confirmado as boolean | null) ?? false,
      repasse_em:           (ag.repasse_em as string | null) ?? null,
    })
  }

  const clinicas = Object.values(map).sort((a, b) => b.total - a.total)

  return NextResponse.json({ clinicas })
}

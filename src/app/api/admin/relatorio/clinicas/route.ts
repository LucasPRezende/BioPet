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
    .select('clinica_id, valor, status_pagamento, tipo_exame, data_hora, clinicas(nome)')
    .not('clinica_id', 'is', null)
    .neq('status', 'cancelado')
    .gte('data_hora', `${inicio}T00:00:00`)
    .lte('data_hora', `${fim}T23:59:59`)
    .order('data_hora', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Agrupa por clínica
  const map: Record<number, {
    clinica_id:   number
    clinica_nome: string
    total:        number
    total_valor:  number
    a_receber:    number
    recebido:     number
    pendente_mp:  number
    agendamentos: { tipo_exame: string; data_hora: string; valor: number | null; status_pagamento: string }[]
  }> = {}

  for (const ag of data ?? []) {
    const cid   = ag.clinica_id as number
    const nome  = (Array.isArray(ag.clinicas) ? ag.clinicas[0] : ag.clinicas as { nome: string } | null)?.nome ?? 'Clínica sem nome'
    const valor = ag.valor ?? 0

    if (!map[cid]) {
      map[cid] = { clinica_id: cid, clinica_nome: nome, total: 0, total_valor: 0, a_receber: 0, recebido: 0, pendente_mp: 0, agendamentos: [] }
    }

    map[cid].total++
    map[cid].total_valor += valor

    if (ag.status_pagamento === 'a_receber')    map[cid].a_receber   += valor
    if (ag.status_pagamento === 'pago_clinica') map[cid].recebido    += valor
    if (ag.status_pagamento === 'pendente')     map[cid].pendente_mp += valor

    map[cid].agendamentos.push({
      tipo_exame:      ag.tipo_exame,
      data_hora:       ag.data_hora,
      valor:           ag.valor,
      status_pagamento: ag.status_pagamento,
    })
  }

  const clinicas = Object.values(map).sort((a, b) => b.total - a.total)

  return NextResponse.json({ clinicas })
}

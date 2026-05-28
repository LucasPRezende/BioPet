import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { parseSystemSession, SESSION_COOKIE_NAME } from '@/lib/system-auth'

function subtract2BusinessDays(from: Date, feriadoSet: Set<string>): Date {
  const d = new Date(from)
  let count = 0
  while (count < 2) {
    d.setDate(d.getDate() - 1)
    const dow = d.getDay()
    const iso = d.toISOString().slice(0, 10)
    if (dow !== 0 && dow !== 6 && !feriadoSet.has(iso)) count++
  }
  return d
}

export async function GET(request: NextRequest) {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (!cookie) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  const session = await parseSystemSession(cookie)
  if (!session || session.role !== 'admin') return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })

  const hoje    = new Date()
  const hojeStr = hoje.toISOString().slice(0, 10)

  // Feriados para cálculo de dias úteis
  const { data: feriados } = await supabase.from('feriados').select('data')
  const feriadoSet = new Set((feriados ?? []).map((f: { data: string }) => f.data))

  const cutoff    = subtract2BusinessDays(hoje, feriadoSet)
  const cutoffStr = cutoff.toISOString().slice(0, 10)

  // 1) Laudos sem agendamento vinculado (exceto os marcados como dispensados)
  const { count: laudosSemAg } = await supabase
    .from('laudos')
    .select('id', { count: 'exact', head: true })
    .is('agendamento_id', null)
    .is('agendamento_dispensado', false)

  // 2) Agendamentos concluídos/em atendimento há mais de 2 dias úteis sem laudo
  const { data: agsCandidatos } = await supabase
    .from('agendamentos')
    .select('id, tipo_exame, data_hora, is_revisao, laudo_revisao_solicitado, laudo_dispensado, pets(nome), tutores(nome)')
    .in('status', ['concluído', 'em atendimento'])
    .lte('data_hora', `${cutoffStr}T23:59:59`)

  const candidatos = (agsCandidatos ?? []).filter(ag => {
    if (ag.laudo_dispensado) return false
    if (ag.is_revisao && !ag.laudo_revisao_solicitado) return false
    return true
  })

  let faltaLaudoLista: { id: number; tipo_exame: string; data_hora: string; pet_nome: string }[] = []
  if (candidatos.length > 0) {
    const ids = candidatos.map(ag => ag.id)
    const { data: laudosExistentes } = await supabase
      .from('laudos')
      .select('agendamento_id')
      .in('agendamento_id', ids)

    const comLaudo = new Set((laudosExistentes ?? []).map(l => l.agendamento_id))
    faltaLaudoLista = candidatos
      .filter(ag => !comLaudo.has(ag.id))
      .map(ag => ({
        id:         ag.id,
        tipo_exame: ag.tipo_exame,
        data_hora:  ag.data_hora,
        pet_nome:   (Array.isArray(ag.pets) ? ag.pets[0] : ag.pets as { nome: string } | null)?.nome ?? '—',
      }))
  }

  // 3) Agendamentos hoje com pagamento pendente
  const { data: pagHoje } = await supabase
    .from('agendamentos')
    .select('id, tipo_exame, valor, status_pagamento, pets(nome), tutores(nome)')
    .gte('data_hora', `${hojeStr}T00:00:00`)
    .lte('data_hora', `${hojeStr}T23:59:59`)
    .in('status_pagamento', ['pendente', 'a_receber'])
    .neq('status', 'cancelado')
    .neq('forma_pagamento', 'gratuito')

  return NextResponse.json({
    laudos_sem_agendamento:    laudosSemAg ?? 0,
    falta_laudo:               faltaLaudoLista.length,
    falta_laudo_lista:         faltaLaudoLista,
    falta_pagamento_hoje:      (pagHoje ?? []).length,
    falta_pagamento_hoje_valor: (pagHoje ?? []).reduce((s, r) => s + Number(r.valor ?? 0), 0),
    falta_pagamento_hoje_lista: (pagHoje ?? []).map(ag => ({
      id:              ag.id,
      tipo_exame:      ag.tipo_exame,
      valor:           ag.valor,
      status_pagamento: ag.status_pagamento,
      pet_nome:        (Array.isArray(ag.pets) ? ag.pets[0] : ag.pets as { nome: string } | null)?.nome ?? '—',
    })),
  })
}

import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { parseSystemSession, SESSION_COOKIE_NAME } from '@/lib/system-auth'

// ── Helper: verifica se data/hora está dentro do horário comercial ─────────────
function isHorarioComercial(dataHora: string, inicio: string, fim: string): boolean {
  const d = new Date(dataHora)
  const dow = d.getDay()
  if (dow === 0 || dow === 6) return false  // fim de semana

  const toMin = (t: string) => {
    const [h, m] = t.split(':').map(Number)
    return h * 60 + m
  }
  const atual = d.getHours() * 60 + d.getMinutes()
  return atual >= toMin(inicio) && atual < toMin(fim)
}

// ── GET /api/revisoes ─────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (!cookie) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  const session = await parseSystemSession(cookie)
  if (!session) return NextResponse.json({ error: 'Sessão inválida.' }, { status: 401 })

  const status = request.nextUrl.searchParams.get('status')

  let q = supabase
    .from('agendamentos')
    .select('id, tipo_exame, data_hora, status, valor, status_pagamento, laudo_revisao_solicitado, is_revisao, agendamento_original_id, tutores(id, nome, telefone), pets(id, nome, especie)')
    .eq('is_revisao', true)
    .order('id', { ascending: false })

  if (status) q = q.eq('status', status)
  if (session.role !== 'admin') q = q.eq('system_user_id', session.userId)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Busca datas dos agendamentos originais em lote
  const originalIds = Array.from(new Set((data ?? []).map(r => r.agendamento_original_id).filter(Boolean)))
  let originalMap: Record<number, { data_hora: string }> = {}
  if (originalIds.length > 0) {
    const { data: originais } = await supabase
      .from('agendamentos')
      .select('id, data_hora')
      .in('id', originalIds)
    for (const o of originais ?? []) originalMap[o.id] = o
  }

  const result = (data ?? []).map(r => ({
    ...r,
    original: r.agendamento_original_id ? (originalMap[r.agendamento_original_id] ?? null) : null,
  }))

  return NextResponse.json(result)
}

// ── POST /api/revisoes ────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (!cookie) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  const session = await parseSystemSession(cookie)
  if (!session) return NextResponse.json({ error: 'Sessão inválida.' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const { agendamento_original_id, data_hora, laudo_solicitado, veterinario_id, observacoes } = body ?? {}

  if (!agendamento_original_id || !data_hora) {
    return NextResponse.json({ error: 'agendamento_original_id e data_hora são obrigatórios.' }, { status: 400 })
  }

  // 1. Busca o agendamento original
  const { data: original, error: errOrig } = await supabase
    .from('agendamentos')
    .select('id, tipo_exame, data_hora, status, tutor_id, pet_id, veterinario_id, duracao_minutos')
    .eq('id', agendamento_original_id)
    .single()

  if (errOrig || !original) return NextResponse.json({ error: 'Agendamento original não encontrado.' }, { status: 404 })

  // 2. Busca configuração de revisão para o tipo de exame
  const { data: config } = await supabase
    .from('revisao_config')
    .select('*')
    .eq('tipo_exame', original.tipo_exame)
    .eq('permite_revisao', true)
    .single()

  if (!config) {
    return NextResponse.json({ error: `O exame "${original.tipo_exame}" não permite revisão.` }, { status: 422 })
  }

  // 3. Valida prazo
  const dataOriginal = new Date(original.data_hora)
  const prazoLimite  = new Date(dataOriginal.getTime() + config.prazo_dias * 24 * 60 * 60 * 1000)
  if (new Date() > prazoLimite) {
    return NextResponse.json({
      error: `Prazo de revisão expirado. O limite era ${prazoLimite.toLocaleDateString('pt-BR')}.`,
    }, { status: 422 })
  }

  // 4. Valida limite de revisões por agendamento original
  const { count: totalRevisoes } = await supabase
    .from('agendamentos')
    .select('id', { count: 'exact', head: true })
    .eq('agendamento_original_id', agendamento_original_id)
    .eq('is_revisao', true)
    .in('status', ['agendado', 'em atendimento', 'concluído'])

  const revisoesFeit = totalRevisoes ?? 0
  if (revisoesFeit >= config.max_revisoes) {
    const limite = config.max_revisoes === 1 ? '1 revisão' : `${config.max_revisoes} revisões`
    return NextResponse.json({
      error: `Limite atingido: este agendamento já possui ${limite === '1 revisão' ? 'uma' : config.max_revisoes} ${limite} ${revisoesFeit > 1 ? 'realizadas' : 'realizada ou agendada'}.`,
    }, { status: 422 })
  }

  // 5. Calcula valor
  const comercial    = isHorarioComercial(data_hora, config.horario_inicio, config.horario_fim)
  const valorBase    = comercial ? Number(config.valor_horario_comercial) : Number(config.valor_fora_comercial)
  const laudoExtra   = (!config.gera_laudo && laudo_solicitado) ? Number(config.valor_laudo_extra) : 0
  const valorTotal   = valorBase + laudoExtra

  // 6. Cria o agendamento de revisão
  const { data: revisao, error: errRev } = await supabase
    .from('agendamentos')
    .insert({
      tutor_id:                   original.tutor_id,
      pet_id:                     original.pet_id,
      tipo_exame:                 original.tipo_exame,
      data_hora,
      duracao_minutos:            original.duracao_minutos ?? 30,
      valor:                      valorTotal > 0 ? valorTotal : null,
      forma_pagamento:            'a confirmar',
      status:                     'agendado',
      status_pagamento:           valorTotal > 0 ? 'pendente' : 'a_receber',
      system_user_id:             session.userId,
      veterinario_id:             veterinario_id ?? original.veterinario_id ?? null,
      observacoes:                observacoes ?? null,
      is_revisao:                 true,
      agendamento_original_id:    agendamento_original_id,
      laudo_revisao_solicitado:   !config.gera_laudo && laudo_solicitado ? true : false,
    })
    .select('id')
    .single()

  if (errRev) return NextResponse.json({ error: errRev.message }, { status: 500 })

  return NextResponse.json({
    agendamento_id:    revisao.id,
    horario_comercial: comercial,
    valor_total:       valorTotal,
    laudo_incluido:    config.gera_laudo || laudo_solicitado,
  }, { status: 201 })
}

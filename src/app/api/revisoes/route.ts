import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { parseSystemSession, SESSION_COOKIE_NAME } from '@/lib/system-auth'
import { sendWhatsAppText } from '@/lib/evolution'
import { gerarFeriadosPorAno } from '@/lib/feriados'
import { gerarPreferenciaMp } from '@/lib/mp-preference'
import { gerarPixToken } from '@/lib/pix-token'

const DIAS_PT = ['domingo','segunda-feira','terça-feira','quarta-feira','quinta-feira','sexta-feira','sábado']
function formatDT(isoStr: string): string {
  const [datePart, timePart = '00:00'] = isoStr.split('T')
  const [year, month, day] = datePart.split('-').map(Number)
  const [hour, minute]     = timePart.split(':').map(Number)
  const d  = new Date(year, month - 1, day, hour, minute)
  const dd = String(day).padStart(2, '0')
  const mm = String(month).padStart(2, '0')
  const hh = String(hour).padStart(2, '0')
  const mn = minute > 0 ? `:${String(minute).padStart(2, '0')}` : ''
  return `${DIAS_PT[d.getDay()]}, ${dd}/${mm} às ${hh}h${mn}`
}

// ── Helper: verifica se data/hora está dentro do horário comercial ─────────────
function isHorarioComercial(dataHora: string, inicio: string, fim: string, feriados: string[] = []): boolean {
  const d = new Date(dataHora)
  const dow = d.getDay()
  if (dow === 0 || dow === 6) return false
  const dateStr = d.toLocaleDateString('en-CA')
  if (feriados.includes(dateStr)) return false
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
  const { agendamento_original_id, data_hora, laudo_solicitado, forma_pagamento, enviar_link, veterinario_id, observacoes } = body ?? {}
  const laudoSolicitado = !!laudo_solicitado
  const enviarLink      = enviar_link !== false

  if (!agendamento_original_id || !data_hora) {
    return NextResponse.json({ error: 'agendamento_original_id e data_hora são obrigatórios.' }, { status: 400 })
  }

  // 1. Busca o agendamento original (inclui tutor e pet para notificação)
  const { data: original, error: errOrig } = await supabase
    .from('agendamentos')
    .select('id, tipo_exame, data_hora, status, tutor_id, pet_id, veterinario_id, duracao_minutos, tutores(nome, telefone), pets(nome)')
    .eq('id', agendamento_original_id)
    .single()

  if (errOrig || !original) return NextResponse.json({ error: 'Agendamento original não encontrado.' }, { status: 404 })

  // 2. Busca configuração de revisão para o tipo de exame
  // Suporta tipo_exame combinado (ex: "Raio-X, Ultrassom Abdominal")
  const tiposNoAgendamento = original.tipo_exame.split(',').map((t: string) => t.trim())
  const { data: configs } = await supabase
    .from('revisao_config')
    .select('*')
    .in('tipo_exame', tiposNoAgendamento)
    .eq('permite_revisao', true)
  const config = (configs ?? [])[0] ?? null

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

  // 5. Busca feriados + horário global e valida
  const [{ data: feriadosRows }, { data: horarioRows }] = await Promise.all([
    supabase.from('feriados').select('data'),
    supabase.from('system_config').select('key, value').in('key', ['horario_especial_inicio', 'horario_especial_fim']),
  ])
  const dbFeriados = (feriadosRows ?? []).map((f: { data: string }) => f.data)
  const y = new Date().getFullYear()
  const gerados = [y - 1, y, y + 1, y + 2].flatMap(gerarFeriadosPorAno).map(f => f.data)
  const feriados = Array.from(new Set([...dbFeriados, ...gerados]))
  const horarioMap    = Object.fromEntries((horarioRows ?? []).map(r => [r.key, r.value]))
  const horario_inicio = horarioMap['horario_especial_inicio'] ?? '08:00'
  const horario_fim    = horarioMap['horario_especial_fim']    ?? '17:00'

  const originalFoiComercial = isHorarioComercial(original.data_hora, horario_inicio, horario_fim, feriados)
  const revisaoEhComercial   = isHorarioComercial(data_hora, horario_inicio, horario_fim, feriados)

  if (originalFoiComercial && !revisaoEhComercial) {
    return NextResponse.json({
      error: `Revisões de exames em horário comercial só podem ser agendadas em horário comercial (${horario_inicio}–${horario_fim}, seg–sex).`,
    }, { status: 422 })
  }

  // 6. Calcula valor
  let valorBase = 0
  if (config.gera_laudo) {
    valorBase = revisaoEhComercial ? Number(config.valor_horario_comercial) : Number(config.valor_fora_comercial)
  } else if (laudoSolicitado) {
    valorBase = Number(config.valor_laudo_extra)
  }
  const valorTotal = valorBase

  // 7. Cria o agendamento de revisão
  const { data: revisao, error: errRev } = await supabase
    .from('agendamentos')
    .insert({
      tutor_id:                   original.tutor_id,
      pet_id:                     original.pet_id,
      tipo_exame:                 original.tipo_exame,
      data_hora,
      duracao_minutos:            original.duracao_minutos ?? 30,
      valor:                      valorTotal > 0 ? valorTotal : null,
      forma_pagamento:            valorTotal > 0 ? (forma_pagamento || 'a confirmar') : 'gratuito',
      entrega_pagamento:          valorTotal > 0 && forma_pagamento === 'pix' ? 'link' : null,
      status:                     'agendado',
      status_pagamento:           valorTotal > 0 ? 'pendente' : 'gratuito',
      system_user_id:             session.userId,
      veterinario_id:             veterinario_id ?? original.veterinario_id ?? null,
      observacoes:                observacoes ?? null,
      is_revisao:                 true,
      agendamento_original_id:    agendamento_original_id,
      laudo_revisao_solicitado:   config.gera_laudo || laudoSolicitado,
      origem:                     'manual',
    })
    .select('id')
    .single()

  if (errRev) return NextResponse.json({ error: errRev.message }, { status: 500 })

  // 8. Gera link de pagamento se houver valor
  let mpInitPoint: string | null = null
  if (valorTotal > 0) {
    try {
      if (forma_pagamento === 'pix') {
        const pixToken = gerarPixToken()
        mpInitPoint = `${process.env.NEXT_PUBLIC_URL}/pagamento/pix/${pixToken}`
        await supabase
          .from('agendamentos')
          .update({ pix_token: pixToken, mp_init_point: mpInitPoint, status_pagamento: 'a_receber' })
          .eq('id', revisao.id)
      } else {
        const mp = await gerarPreferenciaMp(revisao.id)
        mpInitPoint = mp.init_point
      }
    } catch {
      // Falha no link não cancela a criação da revisão
    }
  }

  // 9. Notifica tutor via WhatsApp
  const tutor = Array.isArray(original.tutores) ? (original.tutores as { nome: string | null; telefone: string }[])[0] : original.tutores as { nome: string | null; telefone: string } | null
  const pet   = Array.isArray(original.pets)    ? (original.pets    as { nome: string }[])[0]                          : original.pets    as { nome: string } | null
  if (tutor?.telefone) {
    const digits  = tutor.telefone.replace(/\D/g, '')
    const tel     = digits.startsWith('55') ? digits : `55${digits}`
    const valorFmt = valorTotal > 0
      ? Number(valorTotal).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
      : null
    await sendWhatsAppText(tel, [
      `🔄 *Revisão agendada!*`,
      ``,
      `🐾 Pet: ${pet?.nome ?? '—'}`,
      `  💉 ${original.tipo_exame}`,
      `📅 ${formatDT(data_hora)}`,
      `📍 BioPet - Volta Redonda`,
      valorTotal === 0
        ? `✅ *Revisão gratuita — sem geração de laudo.*\n*Caso precise do laudo, há um custo adicional. Entre em contato!*`
        : `💰 Valor: ${valorFmt}`,
      mpInitPoint && enviarLink ? `\nLink de pagamento:\n👉 ${mpInitPoint}` : null,
      ``,
      `Dúvidas? É só chamar! 🐾`,
    ].filter(Boolean).join('\n'))
  }

  return NextResponse.json({
    agendamento_id:    revisao.id,
    horario_comercial: revisaoEhComercial,
    valor_total:       valorTotal,
    laudo_incluido:    config.gera_laudo,
    mp_init_point:     mpInitPoint,
  }, { status: 201 })
}

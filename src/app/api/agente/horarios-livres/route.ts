import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { verifyAgentKey } from '@/lib/agent-auth'
import { isHorarioEspecial } from '@/lib/feriados'

const DIAS_SEMANA = [
  'domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado',
]

/** Dia da semana de uma data YYYY-MM-DD, calculado dos componentes (evita bug de fuso do Date.parse). */
function diaDaSemana(dataISO: string): string {
  const [year, month, day] = dataISO.split('-').map(Number)
  return DIAS_SEMANA[new Date(year, month - 1, day).getDay()]
}

export async function GET(request: NextRequest) {
  if (!verifyAgentKey(request)) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
  }

  const { searchParams } = request.nextUrl
  const data      = searchParams.get('data')
  const duracao   = Number(searchParams.get('duracao')   ?? 30)  // duração do novo agendamento (min)
  const inicio    = searchParams.get('inicio')   ?? '08:00'       // início do expediente
  const fim       = searchParams.get('fim')      ?? '18:00'       // fim do expediente
  const intervalo = Number(searchParams.get('intervalo') ?? 30)   // intervalo entre slots (min)

  if (!data) {
    return NextResponse.json(
      { error: 'Parâmetro "data" é obrigatório (formato: YYYY-MM-DD).' },
      { status: 400 },
    )
  }

  // Busca todos agendamentos ativos do dia + config de horário especial (mesma
  // fonte usada no cálculo real de preço em calcularEspecial/agendamento-helpers)
  const [{ data: agendamentos }, { data: feriadosRows }, { data: horarioRows }] = await Promise.all([
    supabase
      .from('agendamentos')
      .select('data_hora, duracao_minutos')
      .gte('data_hora', `${data}T00:00:00`)
      .lte('data_hora', `${data}T23:59:59`)
      .neq('status', 'cancelado'),
    supabase.from('feriados').select('data'),
    supabase.from('system_config').select('key, value').in('key', ['horario_especial_inicio', 'horario_especial_fim']),
  ])

  const feriados = (feriadosRows ?? []).map((f: { data: string }) => f.data)
  const cfgMap = Object.fromEntries((horarioRows ?? []).map((r: { key: string; value: string }) => [r.key, r.value]))
  const horarioEspecialInicio = cfgMap['horario_especial_inicio'] ?? '08:00'
  const horarioEspecialFim    = cfgMap['horario_especial_fim']    ?? '17:00'

  // Monta a lista de intervalos ocupados
  const ocupados = (agendamentos ?? []).map(ag => {
    const agInicio = new Date(`${data}T${ag.data_hora.split('T')[1].substring(0, 5)}`)
    const agFim    = new Date(agInicio.getTime() + (ag.duracao_minutos ?? 30) * 60_000)
    return { inicio: agInicio, fim: agFim }
  })

  // Gera slots a cada `intervalo` minutos dentro do expediente
  const [hIni, mIni] = inicio.split(':').map(Number)
  const [hFim, mFim] = fim.split(':').map(Number)

  const expedienteInicio = new Date(`${data}T00:00:00`)
  expedienteInicio.setHours(hIni, mIni, 0, 0)

  const expedienteFim = new Date(`${data}T00:00:00`)
  expedienteFim.setHours(hFim, mFim, 0, 0)

  // Para HOJE, não oferecer horários com menos de 1h de antecedência (equipe
  // precisa de tempo pra se preparar — pedido da Andreza/Luciana, 15/09/2026).
  const tz = 'America/Sao_Paulo'
  const agora = new Date()
  const antecedenciaMinima = new Date(agora.getTime() + 60 * 60_000)
  const hojeSP = agora.toLocaleDateString('en-CA', { timeZone: tz })           // YYYY-MM-DD
  const horaMinimaSP = antecedenciaMinima.toLocaleTimeString('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit' }) // HH:MM
  const ehHoje = data === hojeSP

  // Horário de almoço: ninguém disponível pra atender exame entre 12:30 e
  // 13:30, nenhum dia (pedido da Andreza/Luciana, 15/09/2026).
  const almocoInicio = new Date(`${data}T00:00:00`)
  almocoInicio.setHours(12, 30, 0, 0)
  const almocoFim = new Date(`${data}T00:00:00`)
  almocoFim.setHours(13, 30, 0, 0)

  // Teto de 15h na lista de sugestões de tarde (pedido do Lucas, 23/09/2026):
  // a IA não deve listar horários de tarde depois das 15h como sugestão
  // espontânea, mas ainda pode confirmar um horário específico que o cliente
  // peça depois disso. Por isso NÃO removemos nada de "horarios_livres" (a
  // lista completa continua servindo pra checar um horário específico) — em
  // vez disso mandamos "horarios_para_sugerir_tarde" já pronta e filtrada,
  // pra IA não precisar comparar hora nenhuma de cabeça nem confundir com o
  // campo "especial" (que é sobre preço, não sobre a lista de sugestão).
  const TETO_SUGESTAO_TARDE = '15:00'

  const horarios_livres: { hora: string; especial: boolean }[] = []
  const cursor = new Date(expedienteInicio)

  while (cursor < expedienteFim) {
    const slotFim = new Date(cursor.getTime() + duracao * 60_000)

    // Slot não pode ultrapassar o fim do expediente
    if (slotFim <= expedienteFim) {
      const conflito = ocupados.some(oc => cursor < oc.fim && slotFim > oc.inicio)
      const noAlmoco = cursor < almocoFim && slotFim > almocoInicio
      const hh = String(cursor.getHours()).padStart(2, '0')
      const mm = String(cursor.getMinutes()).padStart(2, '0')
      const horaStr = `${hh}:${mm}`
      const semAntecedencia = ehHoje && horaStr < horaMinimaSP
      if (!conflito && !noAlmoco && !semAntecedencia) {
        // Mesma regra usada no cálculo real do preço (agendamento-helpers):
        // especial quando início+duração ultrapassa o horário configurado em
        // Feriados — não apenas o horário de início.
        const especial = isHorarioEspecial(horaStr, duracao, data, feriados, horarioEspecialFim, horarioEspecialInicio)
        horarios_livres.push({ hora: horaStr, especial })
      }
    }

    cursor.setMinutes(cursor.getMinutes() + intervalo)
  }

  const horarios_para_sugerir_tarde = horarios_livres
    .map(h => h.hora)
    .filter(hora => hora >= '12:00' && hora <= TETO_SUGESTAO_TARDE)

  return NextResponse.json({
    data,
    dia_semana: diaDaSemana(data),
    duracao_minutos: duracao,
    expediente: { inicio, fim },
    total_livres: horarios_livres.length,
    horarios_livres,
    horarios_para_sugerir_tarde,
  })
}

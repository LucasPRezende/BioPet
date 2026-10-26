// Cálculo de Páscoa (algoritmo de Gauss) e geração de feriados para Volta Redonda

export interface FeriadoGerado {
  data: string  // YYYY-MM-DD
  nome: string
  tipo: 'nacional' | 'estadual' | 'municipal'
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

function toISO(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function calcularPascoa(ano: number): Date {
  const a = ano % 19
  const b = ano % 4
  const c = ano % 7
  const d = (19 * a + 24) % 30
  let e = (2 * b + 4 * c + 6 * d + 5) % 7

  let dia = 22 + d + e
  let mes = 3

  if (d === 29 && e === 6) dia -= 7
  else if (d === 28 && e === 6 && a > 10) dia -= 7

  if (dia > 31) { dia -= 31; mes = 4 }

  return new Date(ano, mes - 1, dia)
}

export function gerarFeriadosPorAno(ano: number): FeriadoGerado[] {
  const f: FeriadoGerado[] = []

  // Nacionais fixos
  f.push({ data: `${ano}-01-01`, nome: 'Confraternização Universal',   tipo: 'nacional' })
  f.push({ data: `${ano}-04-21`, nome: 'Tiradentes',                   tipo: 'nacional' })
  f.push({ data: `${ano}-05-01`, nome: 'Dia do Trabalho',              tipo: 'nacional' })
  f.push({ data: `${ano}-09-07`, nome: 'Independência do Brasil',      tipo: 'nacional' })
  f.push({ data: `${ano}-10-12`, nome: 'Nossa Senhora Aparecida',      tipo: 'nacional' })
  f.push({ data: `${ano}-11-02`, nome: 'Finados',                      tipo: 'nacional' })
  f.push({ data: `${ano}-11-15`, nome: 'Proclamação da República',     tipo: 'nacional' })
  f.push({ data: `${ano}-11-20`, nome: 'Dia da Consciência Negra',     tipo: 'nacional' })
  f.push({ data: `${ano}-12-25`, nome: 'Natal',                        tipo: 'nacional' })

  // Estadual RJ
  f.push({ data: `${ano}-04-23`, nome: 'São Jorge',                    tipo: 'estadual' })

  // Municipal Volta Redonda (fixos)
  f.push({ data: `${ano}-06-13`, nome: 'Santo Antônio - Padroeiro de Volta Redonda', tipo: 'municipal' })
  f.push({ data: `${ano}-07-17`, nome: 'Aniversário de Volta Redonda', tipo: 'municipal' })

  // Nacionais móveis via Páscoa
  const pascoa = calcularPascoa(ano)
  f.push({ data: toISO(addDays(pascoa, -48)), nome: 'Segunda-feira de Carnaval', tipo: 'nacional' })
  f.push({ data: toISO(addDays(pascoa, -47)), nome: 'Terça-feira de Carnaval',   tipo: 'nacional' })
  f.push({ data: toISO(addDays(pascoa, -2)),  nome: 'Sexta-feira Santa',         tipo: 'nacional' })
  f.push({ data: toISO(addDays(pascoa,  60)), nome: 'Corpus Christi',            tipo: 'estadual' })

  return f
}

export function isHorarioEspecial(
  hora: string,
  totalDuracao: number,
  data?: string,
  feriadoDatas?: string[],
  horarioFim = '17:00',
  horarioInicio = '08:00',
): boolean {
  if (data) {
    if (feriadoDatas?.includes(data)) return true
    const dia = new Date(`${data}T12:00:00`).getDay()
    if (dia === 0 || dia === 6) return true
  }
  if (!hora) return false
  const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
  const inicioMin = toMin(hora)
  if (inicioMin < toMin(horarioInicio)) return true
  return inicioMin + totalDuracao > toMin(horarioFim)
}

/**
 * Horas ÚTEIS decorridas entre duas datas: fins de semana e feriados contam
 * ZERO, dias úteis contam as 24h corridas (não restringe a horário comercial
 * dentro do dia). Usado para SLAs tipo "laudo sai em até 48h úteis" — o prazo
 * "pausa" no fim de semana/feriado e retoma no próximo dia útil.
 */
export function horasUteisDesde(inicioISO: string, agora: Date, feriados: string[]): number {
  const inicio = new Date(inicioISO)
  if (agora <= inicio) return 0

  let totalMs = 0
  let cursor = new Date(inicio)

  while (cursor < agora) {
    const fimDoDia = new Date(cursor)
    fimDoDia.setHours(24, 0, 0, 0)
    const fimTrecho = fimDoDia < agora ? fimDoDia : agora

    const diaSemana = cursor.getDay()
    const iso = toISO(cursor)
    const ehUtil = diaSemana !== 0 && diaSemana !== 6 && !feriados.includes(iso)
    if (ehUtil) totalMs += fimTrecho.getTime() - cursor.getTime()
    cursor = fimTrecho
  }

  return totalMs / 3_600_000
}

export interface InfoDiaEspecial {
  /** true quando o DIA INTEIRO é horário especial (feriado ou fim de semana). */
  dia_especial: boolean
  motivo_dia_especial: 'feriado' | 'fim_de_semana' | null
  feriado_nome: string | null
  /** Texto pronto pra IA quando dia_especial=true; null caso contrário. */
  aviso_dia_especial: string | null
}

/**
 * Resume se a DATA inteira é horário especial (feriado ou sábado/domingo). A IA
 * errou duas vezes (07/09 e 08/10/2026) tratando segunda-feira de feriado como
 * dia comercial porque só recebia o "especial" de cada slot — sem nenhum sinal
 * no nível do dia. Aqui o backend diz explicitamente.
 */
export function infoDiaEspecial(
  data: string,
  feriados: { data: string; nome?: string | null }[],
): InfoDiaEspecial {
  const feriado = feriados.find((f) => f.data === data)
  const dow = new Date(`${data}T12:00:00`).getDay()
  const fimDeSemana = dow === 0 || dow === 6

  if (!feriado && !fimDeSemana) {
    return { dia_especial: false, motivo_dia_especial: null, feriado_nome: null, aviso_dia_especial: null }
  }

  const motivo = feriado ? 'feriado' : 'fim_de_semana'
  const nome = feriado?.nome?.trim() || null
  const aviso = feriado
    ? `ATENÇÃO: ${data} é FERIADO${nome ? ` (${nome})` : ''} — o dia INTEIRO é horário especial, mesmo caindo em dia de semana. ` +
      'Todos os horários cobram o valor "fora_horario" e o agendamento é confirmado por um atendente. ' +
      'Nunca diga ao cliente que esse dia "não é feriado" nem cote o preço comercial.'
    : `ATENÇÃO: ${data} é fim de semana — o dia INTEIRO é horário especial. ` +
      'Todos os horários cobram o valor "fora_horario" e o agendamento é confirmado por um atendente.'

  return { dia_especial: true, motivo_dia_especial: motivo, feriado_nome: nome, aviso_dia_especial: aviso }
}

export type MotivoEspecial = 'feriado' | 'fimdesemana' | 'antes' | 'depois' | null

export function motivoHorarioEspecial(
  hora: string,
  totalDuracao: number,
  data: string,
  feriadoDatas: string[],
  horarioFim = '17:00',
  horarioInicio = '08:00',
): MotivoEspecial {
  if (feriadoDatas.includes(data)) return 'feriado'
  const dia = new Date(`${data}T12:00:00`).getDay()
  if (dia === 0 || dia === 6) return 'fimdesemana'
  if (!hora) return null
  const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
  if (toMin(hora) < toMin(horarioInicio)) return 'antes'
  if (toMin(hora) + totalDuracao > toMin(horarioFim)) return 'depois'
  return null
}

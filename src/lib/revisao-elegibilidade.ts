/**
 * Regra de elegibilidade de revisão (compartilhada entre o painel admin e o
 * agente de WhatsApp): dentro do prazo (revisao_config.prazo_dias a partir do
 * exame original) e ainda não bateu o limite (revisao_config.max_revisoes).
 */
export interface RevisaoConfigElegibilidade {
  prazo_dias: number
  max_revisoes: number
}

export interface ElegibilidadeRevisao {
  pode_agendar: boolean
  prazo_ok: boolean
  limite_ok: boolean
  prazo_limite: Date
}

export function calcularElegibilidadeRevisao(
  dataOriginalISO: string,
  config: RevisaoConfigElegibilidade,
  revisoesAtivas: number,
  agora: Date = new Date(),
): ElegibilidadeRevisao {
  const dataOriginal = new Date(dataOriginalISO)
  const prazoLimite = new Date(dataOriginal.getTime() + config.prazo_dias * 86_400_000)
  const prazo_ok = agora <= prazoLimite
  const limite_ok = revisoesAtivas < config.max_revisoes
  return { pode_agendar: prazo_ok && limite_ok, prazo_ok, limite_ok, prazo_limite: prazoLimite }
}

/**
 * Janela comercial pela regra do painel admin (/api/revisoes): conta só o
 * HORÁRIO DE INÍCIO — começou dentro de [inicio, fim), em dia útil não-feriado,
 * é comercial, mesmo que o exame termine depois do fim da janela. Parse feito
 * dos componentes da string (sem Date.parse) para não depender do fuso do servidor.
 */
export function dentroJanelaComercial(
  dataHoraISO: string,
  horarioInicio: string,
  horarioFim: string,
  feriados: string[],
): boolean {
  const [data, horaCompleta = '00:00'] = dataHoraISO.split('T')
  const [y, m, d] = data.split('-').map(Number)
  const dow = new Date(y, m - 1, d).getDay()
  if (dow === 0 || dow === 6) return false
  if (feriados.includes(data)) return false
  const toMin = (t: string) => {
    const [h, mm] = t.split(':').map(Number)
    return h * 60 + mm
  }
  const inicio = toMin(horaCompleta.slice(0, 5))
  return inicio >= toMin(horarioInicio) && inicio < toMin(horarioFim)
}

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

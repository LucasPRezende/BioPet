/**
 * Até quanto tempo DEPOIS do horário marcado um agendamento ainda aparece em
 * meus_agendamentos. Sem essa folga, o cliente que escreve "estou a caminho"
 * ou "vou me atrasar" no horário do exame (ou logo depois) não via o próprio
 * agendamento e a IA achava que não existia nada marcado (Ivanilza, 15/10).
 */
export const FOLGA_APOS_INICIO_MS = 2 * 3_600_000

/**
 * data_hora é naive (horário de Brasília sem fuso) — o limite sai na mesma
 * representação. Parse com "Z" só para somar/subtrair sem depender do fuso do
 * servidor; o resultado volta a ser string naive.
 */
export function limiteInferiorMeusAgendamentos(agoraLocalISO: string): string {
  const t = new Date(`${agoraLocalISO.slice(0, 19)}Z`).getTime() - FOLGA_APOS_INICIO_MS
  return new Date(t).toISOString().slice(0, 19)
}

/** True se o horário marcado já passou (o agendamento está em curso ou acabou de começar). */
export function jaComecou(dataHora: string, agoraLocalISO: string): boolean {
  return new Date(`${dataHora.slice(0, 19)}Z`).getTime() <= new Date(`${agoraLocalISO.slice(0, 19)}Z`).getTime()
}

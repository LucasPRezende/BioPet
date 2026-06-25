/**
 * Regras de Raio-X para o agente.
 *
 * Definir "uma posição = um estudo" vs "estudo adicional" é julgamento clínico
 * que a clínica não consegue formalizar em regras. Decisão: a IA só agenda
 * Raio-X de UM estudo (um item "Raio-X", mesmo que com várias projeções na
 * descrição). Se houver MAIS DE UM item de Raio-X (vários estudos), o backend
 * recusa e a IA encaminha para um atendente definir estudos e preço.
 */

export interface ItemRaioX {
  tipo_exame: string
  descricao?: string | null
  duracao_minutos?: number
}

export const ehRaioXBase = (t: string) =>
  /raio.?-?x/i.test(t) && !/(acr[ée]scimo|adicional)/i.test(t)

export const ehRaioXAcrescimo = (t: string) =>
  /raio.?-?x/i.test(t) && /(acr[ée]scimo|adicional)/i.test(t)

const ehRaioX = (t: string) => ehRaioXBase(t) || ehRaioXAcrescimo(t)

/** Quantos itens relacionados a Raio-X há na lista (base + acréscimos). */
export function contarItensRaioX(lista: ItemRaioX[]): number {
  return lista.filter(e => ehRaioX(e.tipo_exame)).length
}

/**
 * True quando o agendamento envolve mais de um estudo de Raio-X — caso que a IA
 * NÃO deve precificar/agendar (vai para atendente).
 */
export function raioXPrecisaAtendente(lista: ItemRaioX[]): boolean {
  return contarItensRaioX(lista) > 1
}

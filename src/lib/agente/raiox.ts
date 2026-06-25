/**
 * Trava de preço do Raio-X: cobra-se apenas UM "Raio-X" base; TODA posição além
 * da primeira é acréscimo. A IA às vezes monta vários bases (quando o
 * encaminhamento lista as posições separadas) — aqui convertemos os bases
 * excedentes no exame de acréscimo, preservando a descrição (posição).
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

/**
 * Mantém o primeiro "Raio-X" base e converte os bases excedentes em
 * `nomeAcrescimo`. Não altera nada se houver 0 ou 1 base, ou se `nomeAcrescimo`
 * estiver ausente.
 */
export function aplicarTravaRaioX<T extends ItemRaioX>(lista: T[], nomeAcrescimo?: string): T[] {
  const bases = lista.filter(e => ehRaioXBase(e.tipo_exame))
  if (bases.length <= 1 || !nomeAcrescimo) return lista

  let primeiro = true
  return lista.map(e => {
    if (ehRaioXBase(e.tipo_exame)) {
      if (primeiro) { primeiro = false; return e }
      return { ...e, tipo_exame: nomeAcrescimo }
    }
    return e
  })
}

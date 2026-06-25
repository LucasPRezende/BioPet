/**
 * Trava de exames agendáveis pela IA.
 *
 * A IA só pode agendar exames que (a) existem na tabela de preços
 * (comissoes_exame) E (b) não estão na lista de não-agendáveis configurada.
 * Qualquer outra coisa — sub-exame de bioquímica (TGP, TGO...), nome inventado,
 * exame desativado — deve ir para um atendente. Isso não depende do prompt.
 */

export function normalizarNome(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()
}

/**
 * Devolve o primeiro tipo_exame que IMPEDE o agendamento automático (inexistente
 * na tabela de preços ou marcado como não-agendável), ou null se todos ok.
 */
export function exameBloqueado(
  tipos: string[],
  validos: string[],
  naoAgendaveis: string[],
): string | null {
  const setValidos = new Set(validos.map(normalizarNome))
  const setBloq = new Set(naoAgendaveis.map(normalizarNome))
  for (const t of tipos) {
    const n = normalizarNome(t)
    if (!setValidos.has(n) || setBloq.has(n)) return t
  }
  return null
}

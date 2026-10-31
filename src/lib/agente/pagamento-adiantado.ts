/**
 * Cliente que diz que JÁ PAGOU em dinheiro (ex.: deixou pago com a clínica
 * parceira) — a IA não consegue conferir isso, só a equipe. A regra de prompt
 * manda escalar, mas o modelo às vezes encerra sem chamar transferir_humano; o
 * lembrete vai no resultado do agendar, onde ele sempre lê.
 */
export function pagamentoAdiantadoEmDinheiro(observacoes: unknown): boolean {
  if (typeof observacoes !== 'string') return false
  const texto = observacoes.toLowerCase()
  if (!/dinheiro/.test(texto)) return false
  return /j[áa] (foi |foram )?(pag|deix|quit|feit)|\bpago\b|\bpagou\b|feito em dinheiro/.test(texto)
}

export const AVISO_PAGAMENTO_ADIANTADO =
  'O cliente disse que JÁ PAGOU em dinheiro. Você não consegue conferir isso: chame transferir_humano (motivo pergunta_tecnica, resumo "Cliente diz que JÁ PAGOU em dinheiro — conferir") AGORA, nesta mesma rodada, antes de responder. Não confirme nem negue o pagamento.'

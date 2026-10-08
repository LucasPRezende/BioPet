/**
 * Trava contra FALSA CONFIRMAÇÃO de agendamento.
 *
 * Já aconteceu 3 vezes em produção (Nina/Leidiane 04/10, Camila/Zara 05/10 e
 * outros): a IA escreveu "Agendamento solicitado ✓" sem nenhum agendamento ter
 * sido criado — `agendar` recusou (Raio-X, horário especial, conflito) ou nem
 * foi chamado. A cliente sai achando que está marcado e a equipe pode acreditar
 * no resumo. Prompt não bastou; aqui a regra é determinística, no código.
 *
 * Só olha o selo "…✓" que o prompt manda usar quando algo acabou de ser criado.
 * Recaps ("seu agendamento é amanhã às 9h", "já agendei hoje") NÃO disparam —
 * verbos em 1ª pessoa foram testados e removidos: 1 falso positivo em 28 casos
 * reais (replay nas 448 conversas de PRD, 08/10/2026).
 */

/** Tools que CRIAM agendamento. */
export const TOOLS_QUE_CRIAM_AGENDAMENTO = ['agendar', 'agendar_revisao']

const AFIRMACOES = [
  // Selo padrão do prompt: "Agendamento solicitado ✓", "Revisão registrada ✓"
  /\b(agendamento|revis[ãa]o|exame|ultrassom|raio[- ]?x)\b[^.\n]{0,25}\b(solicitad[oa]|registrad[oa]|confirmad[oa]|criad[oa]|realizad[oa]|feit[oa]|agendad[oa]|marcad[oa])\s*✓/i,
  /✓\s*\n?\s*(agendamento|revis[ãa]o)\b[^.\n]{0,25}\b(solicitad[oa]|registrad[oa]|marcad[oa]|agendad[oa])/i,
]

export interface ChamadaDoTurno {
  nome: string
  resultado: unknown
}

/** True se o texto declara que um agendamento acabou de ser criado. */
export function afirmaAgendamentoCriado(texto: string): boolean {
  return AFIRMACOES.some((re) => re.test(texto))
}

/** True se alguma tool de criação devolveu sucesso (agendamento_id, sem erro). */
export function turnoCriouAgendamento(chamadas: ChamadaDoTurno[]): boolean {
  return chamadas.some((c) => {
    if (!TOOLS_QUE_CRIAM_AGENDAMENTO.includes(c.nome)) return false
    const r = c.resultado as { erro?: unknown; agendamento_id?: unknown } | null
    return !!r && typeof r === 'object' && !r.erro && r.agendamento_id != null
  })
}

/** Mensagem honesta que substitui a falsa confirmação. */
export const TEXTO_SEM_CONFIRMACAO =
  'Ainda não consegui concluir esse agendamento por aqui, então ele *não está marcado*. ' +
  'Já passei o seu pedido para um atendente, que vai confirmar tudo com você em breve. 🐾'

export function violouTrava(texto: string, chamadas: ChamadaDoTurno[]): boolean {
  return afirmaAgendamentoCriado(texto) && !turnoCriouAgendamento(chamadas)
}

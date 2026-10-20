/**
 * Escalada SILENCIOSA: o cliente escreveu sobre assunto pessoal/administrativo
 * com a Dra. Luciana (obra, prestador, projeto, conta…) — nada de pet nem
 * exame. A IA responder só atrapalha: já mandou ligar pro telefone da Clive
 * (07/10) e já tratou "peço paciência com o projeto" como dúvida de exame
 * (19/10). A tool transferir_humano(silencioso:true) avisa a equipe e a
 * resposta ao cliente sai vazia.
 */
import type { ChamadaDoTurno } from './trava-confirmacao'

/** O que fica no histórico no lugar da resposta que o cliente nunca recebeu. */
export const TEXTO_HISTORICO_SILENCIO =
  '[Assunto pessoal/administrativo: a equipe foi avisada e NENHUMA resposta foi enviada ao cliente.]'

/** Tools que só LEEM — podem acontecer num turno silencioso. Qualquer outra (cadastro, agendamento…) cancela o silêncio. */
const TOOLS_SO_LEITURA = ['identificar_tutor', 'meus_agendamentos', 'transferir_humano']

export function escalouEmSilencio(chamadas: ChamadaDoTurno[]): boolean {
  const transf = chamadas.find(
    (c) =>
      c.nome === 'transferir_humano' &&
      c.entrada?.silencioso === true &&
      c.entrada?.motivo === 'ia_travou' &&
      !(c.resultado as { erro?: unknown } | null)?.erro,
  )
  if (!transf) return false
  return chamadas.every((c) => TOOLS_SO_LEITURA.includes(c.nome))
}

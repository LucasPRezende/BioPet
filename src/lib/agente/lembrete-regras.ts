/**
 * Regras puras do lembrete de pergunta ignorada (ver /api/agente/lembretes).
 * Ficam aqui, fora da rota, para serem testadas sem banco.
 */

/**
 * Passos que mostram que a conversa virou um agendamento de verdade. Só
 * consultar preço/laudo ou identificar o cliente NÃO conta: quem só perguntou
 * valor e sumiu não está "travado numa decisão" — cutucar e depois escalar
 * como `ia_travou` só gera alarme falso (casos reais: (24) 99831-8306 em
 * 14/10 e a foto de microhematócrito em 18/10).
 */
export const PASSOS_DE_AGENDAMENTO = [
  'cadastrar_tutor',
  'cadastrar_pet',
  'listar_veterinarios',
  'horarios_livres',
  'agendar',
  'agendar_revisao',
  'remarcar_agendamento',
  'cancelar_agendamento',
]

export function temProgressoReal(historico: any[]): boolean {
  return historico.some(
    (m) =>
      Array.isArray(m?.content) &&
      m.content.some((b: any) => b?.type === 'tool_use' && PASSOS_DE_AGENDAMENTO.includes(b.name)),
  )
}

/**
 * O texto termina numa pergunta? Aceita "?" seguido só de um parêntese curto
 * ("Qual é a espécie do Oto? (cão ou gato)"), pontuação de fechamento e emojis
 * — a regra antiga exigia "?" colado no fim e deixou o Valdir/Oto (15/10)
 * parado sem lembrete.
 */
export function terminaEmPergunta(texto: string): boolean {
  // Emoji = par substituto (😊🐾) ou símbolo BMP (☀ ✓ ❤) + seletor de variação/ZWJ.
  // Sem a flag u (o target do tsconfig não aceita \p{...}).
  const FIM = /\?\s*(\([^)]{0,80}\))?[\s"'”’)\]*_!.]*(?:[\uD800-\uDBFF][\uDC00-\uDFFF]|[\u2190-\u2BFF\uFE0F\u200D\s])*$/
  return FIM.test(texto.trim())
}

/**
 * A mensagem abre com a pergunta de confirmação/pagamento e só depois traz o
 * resumo ("Posso confirmar o agendamento? Resumo: - Pet… - Valor…"). A regra de
 * prompt manda a pergunta VIR PRIMEIRO, então o texto quase nunca termina em
 * "?" — foi assim que o lembrete deixou de pegar a Emanuelle/Bolinha (27/10).
 */
export function temPerguntaDeConfirmacao(texto: string): boolean {
  const confirmar = /\b(posso|pode|podemos|devo|vamos|quer que eu)\s+(confirmar|agendar|marcar|fechar)[^?\n]*\?/i
  const pagamento = /\b(prefere|quer|vai)\b[^?\n]*\b(pix|cart[aã]o)\b[^?\n]*\?/i
  return confirmar.test(texto) || pagamento.test(texto)
}

/** A IA deixou algo esperando resposta: termina em "?" ou abre com a pergunta de confirmação. */
export function aguardaResposta(texto: string): boolean {
  return terminaEmPergunta(texto) || temPerguntaDeConfirmacao(texto)
}

/**
 * "Aliás, ..." é o gancho padrão das ofertas SECUNDÁRIAS (ex.: revisão
 * gratuita) penduradas no fim de uma resposta já resolvida — convite opcional,
 * não decisão travando nada (Thaís/Domínik, 28/09/2026).
 */
export function ehOfertaSecundaria(texto: string): boolean {
  return /aliás/i.test(texto)
}

/** criado_em do Postgres pode vir sem fuso (naive UTC) — normaliza para epoch ms. */
export function epochMs(timestamp: string): number {
  const iso = /[zZ]|[+-]\d{2}:?\d{2}$/.test(timestamp) ? timestamp : `${timestamp}Z`
  return new Date(iso).getTime()
}

/**
 * Alguém (sistema ou atendente) já falou com o cliente DEPOIS da última
 * mensagem da IA? Então a pergunta pendente foi resolvida por outro caminho e
 * o lembrete não faz sentido (item 34: Juliana/Frederico, 06/10 — a equipe
 * criou a revisão 7 min depois da pergunta e o lembrete disparou mesmo assim).
 */
export function equipeRespondeuDepois(ultimaMsgEquipeEm: string | null | undefined, ultimaMsgIaEm: string): boolean {
  if (!ultimaMsgEquipeEm) return false
  return epochMs(ultimaMsgEquipeEm) > epochMs(ultimaMsgIaEm)
}

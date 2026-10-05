/**
 * Detecção de loop robô-com-robô.
 *
 * Alguns contatos que escrevem pro número da clínica são atendimentos
 * automáticos (banco, operadora, anúncio). Cada resposta nossa dispara uma
 * resposta deles e a conversa nunca acaba — gastando chamadas do modelo à toa
 * (casos reais: Itaú, Claro em 02/10/2026, Banco BB em 05/10/2026).
 *
 * Heurística conservadora, só com o que o cliente MANDA (nunca com o que a IA
 * respondeu):
 *   A) a mesma mensagem (normalizada, não-trivial) chega pela 3ª vez;
 *   B) 4 das últimas 6 mensagens têm cara de robô ("não consegui entender",
 *      "menu principal"...) e a IA não chamou nenhuma tool nesse intervalo.
 * Gente de verdade quase nunca cai em nenhuma das duas.
 */

/** Quantas vezes a mesma mensagem (contando a atual) caracteriza loop. */
export const REPETICOES_LOOP = 3
/** Mensagens curtas ("oi", "ok", "?") se repetem normalmente — não contam. */
const TAMANHO_MIN_REPETICAO = 15
const JANELA_ROBO = 6
const MIN_ROBO_NA_JANELA = 4

const PADROES_ROBO = [
  /nao consegui (entender|processar)/,
  /nao entendi muito bem/,
  /tente novamente mais tarde/,
  /digite (apenas )?o tema/,
  /menu principal/,
  /assistente virtual/,
  /atendimento automatico/,
  /estamos indisponiveis no momento/,
  /minha claro/,
  /escolha (uma )?opcao/,
]

export interface ResultadoLoop {
  loop: boolean
  motivo?: 'repeticao' | 'robo'
  /** Trecho da mensagem que disparou, pro resumo da notificação. */
  trecho?: string
}

/** minúsculas, sem acento, sem pontuação/emoji, espaços colapsados. */
export function normalizarMensagem(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

interface MensagemCliente {
  texto: string
  /** Posição no histórico (a atual fica depois do último índice). */
  idx: number
}

function mensagensDoCliente(historico: any[]): MensagemCliente[] {
  const out: MensagemCliente[] = []
  historico.forEach((m, idx) => {
    if (m?.role !== 'user') return
    if (typeof m.content === 'string') {
      out.push({ texto: m.content, idx })
      return
    }
    if (!Array.isArray(m.content)) return
    const partes = m.content
      .filter((b: any) => b?.type === 'text' && typeof b.text === 'string')
      .map((b: any) => b.text)
    if (partes.length > 0) out.push({ texto: partes.join('\n'), idx }) // só tool_result não conta
  })
  return out
}

function temToolUseDepoisDe(historico: any[], idxInicial: number): boolean {
  for (let i = idxInicial; i < historico.length; i++) {
    const m = historico[i]
    if (m?.role === 'assistant' && Array.isArray(m.content) && m.content.some((b: any) => b?.type === 'tool_use')) {
      return true
    }
  }
  return false
}

/**
 * Decide se a mensagem que acabou de chegar (`textoAtual`) fecha um loop com
 * outro robô, olhando o histórico já gravado da conversa.
 */
export function detectarLoopBot(historico: any[], textoAtual: string): ResultadoLoop {
  const anteriores = mensagensDoCliente(historico)
  const atual = normalizarMensagem(textoAtual)

  // A) repetição
  if (atual.length >= TAMANHO_MIN_REPETICAO) {
    const iguais = anteriores.filter((m) => normalizarMensagem(m.texto) === atual).length
    if (iguais + 1 >= REPETICOES_LOOP) {
      return { loop: true, motivo: 'repeticao', trecho: textoAtual.replace(/\s+/g, ' ').trim().slice(0, 120) }
    }
  }

  // B) cara de robô sem progresso real
  const janela = [...anteriores.map((m) => ({ ...m, norm: normalizarMensagem(m.texto) })), { texto: textoAtual, idx: historico.length, norm: atual }]
    .slice(-JANELA_ROBO)
  if (janela.length === JANELA_ROBO) {
    const robos = janela.filter((m) => PADROES_ROBO.some((p) => p.test(m.norm))).length
    if (robos >= MIN_ROBO_NA_JANELA && !temToolUseDepoisDe(historico, janela[0].idx)) {
      return { loop: true, motivo: 'robo', trecho: textoAtual.replace(/\s+/g, ' ').trim().slice(0, 120) }
    }
  }

  return { loop: false }
}

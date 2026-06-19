/**
 * Debounce de mensagens recebidas.
 *
 * Muitos clientes mandam a ideia em várias mensagens quebradas ("oi",
 * "tudo bem?", "queria marcar uma ultra", "para amanhã"). Sem debounce, a IA
 * responde cada fragmento separadamente. Aqui acumulamos as mensagens por
 * telefone e só processamos o conjunto após `DELAY` ms de silêncio.
 *
 * Funciona porque o app roda em processo persistente (PM2/next start), então
 * timers em memória sobrevivem entre requisições. Se o processo reiniciar, um
 * buffer pendente é perdido — aceitável para um chatbot.
 */

type Processar = (
  textoCombinado: string,
  ultimoMsgId: string | undefined,
  pushName: string | undefined,
) => Promise<void>

interface Buffer {
  textos: string[]
  msgIds: Set<string>
  ultimoMsgId?: string
  pushName?: string
  timer: NodeJS.Timeout
}

const DELAY = Number(process.env.AGENTE_DEBOUNCE_MS ?? 8000)
const buffers = new Map<string, Buffer>()

/**
 * Enfileira uma mensagem. Reinicia a janela a cada nova mensagem; quando ela
 * fecha, chama `processar` com o texto concatenado.
 */
export function enfileirarMensagem(
  telefone: string,
  texto: string,
  msgId: string | undefined,
  pushName: string | undefined,
  processar: Processar,
): void {
  let buf = buffers.get(telefone)

  // Dedupe: a Evolution às vezes reenvia o mesmo evento.
  if (buf && msgId && buf.msgIds.has(msgId)) return

  if (!buf) {
    buf = { textos: [], msgIds: new Set(), timer: setTimeout(() => {}, 0) }
    buffers.set(telefone, buf)
  }

  buf.textos.push(texto)
  if (msgId) {
    buf.msgIds.add(msgId)
    buf.ultimoMsgId = msgId
  }
  if (pushName) buf.pushName = pushName

  clearTimeout(buf.timer)
  const atual = buf
  buf.timer = setTimeout(() => {
    buffers.delete(telefone)
    const textoCombinado = atual.textos.join('\n')
    processar(textoCombinado, atual.ultimoMsgId, atual.pushName).catch((e) =>
      console.error('[agente/debounce] erro ao processar:', e),
    )
  }, DELAY)
}

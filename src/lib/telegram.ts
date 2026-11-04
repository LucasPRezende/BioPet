/**
 * Aviso por Telegram para o Lucas (usado pelo vigia do agente).
 *
 * Canal independente do WhatsApp de propósito: o vigia existe para avisar
 * quando o WhatsApp para de funcionar. Configuração (na VPS, .env.local):
 *   TELEGRAM_BOT_TOKEN  — token do bot criado no @BotFather
 *   TELEGRAM_CHAT_ID    — id do chat do Lucas com o bot
 * Sem as duas variáveis, não envia nada (e avisa no log).
 */
export async function enviarTelegram(texto: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID
  if (!token || !chatId) {
    console.warn('[telegram] TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID não configurados — aviso não enviado.')
    return false
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: texto }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) {
      // Não loga a URL (contém o token).
      console.error(`[telegram] sendMessage erro ${res.status}`)
      return false
    }
    return true
  } catch (err) {
    console.error('[telegram] falha ao enviar:', err instanceof Error ? err.message : err)
    return false
  }
}

/**
 * Helpers de conversa do agente de WhatsApp.
 *
 * `parseEvolutionWebhook` normaliza o payload do evento `messages.upsert` da
 * Evolution API para um formato simples e seguro de consumir no webhook.
 *
 * IMPORTANTE — addressingMode "lid": nesta instância o WhatsApp entrega o
 * remetente como `<id>@lid` (identificador anonimizado), que NÃO é o telefone.
 * O número real vem em `key.remoteJidAlt` (`55DDD9XXXXXXXX@s.whatsapp.net`).
 * Por isso priorizamos `remoteJidAlt` ao resolver o telefone.
 */

export interface MensagemRecebida {
  /** True quando há uma mensagem de texto de usuário para processar. */
  processavel: boolean
  /** Motivo do descarte, quando `processavel` é false (para log). */
  motivo?: string
  /** Telefone normalizado em dígitos, com DDI 55. Ex: "5524981367482". */
  telefone?: string
  /** Texto da mensagem do usuário. */
  texto?: string
  /** ID da mensagem (para dedupe). */
  msgId?: string
  /** Nome do contato no WhatsApp (útil para cadastrar tutor novo). */
  pushName?: string
}

/** Extrai o texto de mensagens de texto simples ou estendidas. */
function extrairTexto(message: Record<string, any> | undefined | null): string | null {
  if (!message) return null
  if (typeof message.conversation === 'string') return message.conversation
  const ext = message.extendedTextMessage?.text
  if (typeof ext === 'string') return ext
  return null
}

/** Resolve o telefone real (em dígitos, com 55) a partir da `key` da mensagem. */
function resolverTelefone(key: Record<string, any>): string | null {
  // Prioriza remoteJidAlt (número real) sobre remoteJid (que pode ser @lid).
  const candidatos = [key.remoteJidAlt, key.remoteJid].filter(
    (j): j is string => typeof j === 'string',
  )
  for (const jid of candidatos) {
    if (jid.endsWith('@s.whatsapp.net')) {
      const digits = jid.split('@')[0].replace(/\D/g, '')
      if (digits) return digits.startsWith('55') ? digits : `55${digits}`
    }
  }
  return null // só sobrou @lid/@g.us — sem telefone utilizável
}

export function parseEvolutionWebhook(body: any): MensagemRecebida {
  if (!body || body.event !== 'messages.upsert') {
    return { processavel: false, motivo: `evento ignorado: ${body?.event}` }
  }

  const data = body.data
  const key = data?.key
  if (!key) return { processavel: false, motivo: 'sem data.key' }

  if (key.fromMe === true) return { processavel: false, motivo: 'fromMe' }

  const remoteJid: string = key.remoteJid ?? ''
  if (remoteJid.endsWith('@g.us')) return { processavel: false, motivo: 'grupo' }

  const texto = extrairTexto(data.message)
  if (!texto) return { processavel: false, motivo: 'mensagem sem texto' }

  const telefone = resolverTelefone(key)
  if (!telefone) return { processavel: false, motivo: 'sem telefone (apenas @lid)' }

  return {
    processavel: true,
    telefone,
    texto: texto.trim(),
    msgId: key.id,
    pushName: data.pushName,
  }
}

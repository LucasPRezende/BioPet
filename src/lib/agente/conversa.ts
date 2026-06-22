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
import { supabase } from '@/lib/supabase'

/** Minutos de inatividade até a conversa expirar (reinicia o histórico). */
const TTL_MINUTOS = 60

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
  /** Tipo de mídia, quando a mensagem é áudio/imagem/documento (em vez de texto). */
  tipoMidia?: 'audio' | 'imagem' | 'documento'
  /** Legenda da mídia (caption da imagem), quando houver. */
  legenda?: string
  /** `key` crua da mensagem — necessária para buscar o base64 na Evolution. */
  rawKey?: Record<string, any>
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

  const telefone = resolverTelefone(key)
  if (!telefone) return { processavel: false, motivo: 'sem telefone (apenas @lid)' }

  const msg = data.message ?? {}
  const base = { telefone, msgId: key.id, pushName: data.pushName, rawKey: key }

  // Mídia: áudio (PTT/voz) e imagem (encaminhamento por foto).
  if (msg.audioMessage) {
    return { processavel: true, tipoMidia: 'audio', ...base }
  }
  if (msg.imageMessage) {
    const legenda = typeof msg.imageMessage.caption === 'string' ? msg.imageMessage.caption.trim() : undefined
    return { processavel: true, tipoMidia: 'imagem', legenda, ...base }
  }
  // Documento (PDF de encaminhamento/laudo). WhatsApp às vezes embrulha em
  // documentWithCaptionMessage.
  const doc = msg.documentMessage ?? msg.documentWithCaptionMessage?.message?.documentMessage
  if (doc) {
    const legenda =
      (typeof doc.caption === 'string' && doc.caption.trim()) ||
      (typeof doc.fileName === 'string' && doc.fileName.trim()) ||
      undefined
    return { processavel: true, tipoMidia: 'documento', legenda, ...base }
  }

  const texto = extrairTexto(msg)
  if (!texto) return { processavel: false, motivo: 'mensagem sem texto' }

  return { processavel: true, texto: texto.trim(), ...base }
}

// ---------------------------------------------------------------------------
// Estado da conversa (tabela `conversas`)
// ---------------------------------------------------------------------------

export interface EstadoConversa {
  /** Histórico no formato da Anthropic Messages API (array de {role, content}). */
  historico: any[]
  /** ID da última mensagem já processada (dedupe). */
  ultimaMsgId: string | null
}

/**
 * Carrega o estado da conversa. Se a conversa expirou (inatividade), retorna
 * histórico vazio — começa do zero sem apagar a linha (será sobrescrita).
 */
export async function carregarConversa(telefone: string): Promise<EstadoConversa> {
  const { data } = await supabase
    .from('conversas')
    .select('historico, ultima_msg_id, expira_em')
    .eq('telefone', telefone)
    .maybeSingle()

  if (!data) return { historico: [], ultimaMsgId: null }

  const expirou = data.expira_em && new Date(data.expira_em) < new Date()
  return {
    historico: expirou ? [] : ((data.historico as any[]) ?? []),
    ultimaMsgId: expirou ? null : (data.ultima_msg_id ?? null),
  }
}

/** Persiste o histórico atualizado + marca a última mensagem processada. */
export async function salvarConversa(
  telefone: string,
  historico: any[],
  msgId: string | undefined,
): Promise<void> {
  const agora = new Date()
  const expira = new Date(agora.getTime() + TTL_MINUTOS * 60_000)
  await supabase.from('conversas').upsert(
    {
      telefone,
      historico,
      ultima_msg_id: msgId ?? null,
      atualizado_em: agora.toISOString(),
      expira_em: expira.toISOString(),
    },
    { onConflict: 'telefone' },
  )
}

// ---------------------------------------------------------------------------
// Guard-rails de recepção
// ---------------------------------------------------------------------------

/** Normaliza um telefone para dígitos com DDI 55. */
export function normalizarTelefone(telefone: string): string {
  const digits = telefone.replace(/\D/g, '')
  return digits.startsWith('55') ? digits : `55${digits}`
}

/** True se o número está na lista de bloqueados (configuracoes_agente). */
export async function telefoneBloqueado(telefone: string): Promise<boolean> {
  const { data } = await supabase
    .from('configuracoes_agente')
    .select('numeros_bloqueados')
    .order('id')
    .limit(1)
    .maybeSingle()

  const lista = (data?.numeros_bloqueados as { numero: string }[] | null) ?? []
  const alvo = normalizarTelefone(telefone)
  return lista.some((n) => normalizarTelefone(n.numero ?? '') === alvo)
}

/**
 * True se o tutor está em atendimento humano ativo (o bot deve silenciar).
 * Auto-desbloqueia quando o prazo `atendimento_humano_ate` expira.
 */
export async function emAtendimentoHumano(telefone: string): Promise<boolean> {
  const telNorm = normalizarTelefone(telefone)
  const digits = telefone.replace(/\D/g, '')
  const { data: tutor } = await supabase
    .from('tutores')
    .select('id, atendimento_humano, atendimento_humano_ate')
    .or(`telefone.eq.${telNorm},telefone.eq.${digits}`)
    .maybeSingle()

  if (!tutor?.atendimento_humano) return false

  if (tutor.atendimento_humano_ate && new Date(tutor.atendimento_humano_ate) < new Date()) {
    await supabase
      .from('tutores')
      .update({ atendimento_humano: false, atendimento_humano_ate: null })
      .eq('id', tutor.id)
    return false
  }
  return true
}

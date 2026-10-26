/**
 * Registro e classificação das mensagens SAÍDAS (fromMe) do WhatsApp.
 *
 * O webhook recebe também as mensagens enviadas. Para saber se um fromMe foi a
 * IA, o sistema ou um HUMANO digitando, gravamos o id de tudo que NÓS enviamos
 * (origem 'ia'/'sistema'). Um fromMe com id desconhecido = humano respondeu.
 *
 * Degradação segura: se a tabela não existir ou houver erro de DB, classificamos
 * como 'erro' (não 'humano') — assim a IA NÃO é pausada por engano. O recurso só
 * fica ativo de fato quando a tabela `agente_mensagens_enviadas` existe.
 */
import { supabase } from '@/lib/supabase'
import { normalizeTelefone } from '@/lib/telefone'

export type OrigemEnvio = 'ia' | 'sistema' | 'humano'

function normalizar(telefone: string): string {
  return normalizeTelefone(telefone)
}

/** Grava uma mensagem que NÓS enviamos. Best-effort (nunca lança). */
export async function registrarMensagemEnviada(
  telefone: string,
  msgId: string | null | undefined,
  origem: OrigemEnvio,
  texto?: string | null,
): Promise<void> {
  try {
    await supabase.from('agente_mensagens_enviadas').insert({
      telefone: normalizar(telefone),
      msg_id: msgId ?? null,
      origem,
      texto: texto ?? null,
    })
  } catch {
    /* tabela ausente / erro de DB — ignora (degradação segura) */
  }
}

/**
 * Classifica um fromMe pelo id: 'ia'/'sistema' se foi nosso, 'humano' se o id é
 * desconhecido (alguém digitou), ou 'erro' se não deu para consultar (NÃO tratar
 * como humano nesse caso).
 */
export async function classificarFromMe(
  msgId: string | undefined,
): Promise<OrigemEnvio | 'erro'> {
  if (!msgId) return 'erro'
  const { data, error } = await supabase
    .from('agente_mensagens_enviadas')
    .select('origem')
    .eq('msg_id', msgId)
    .maybeSingle()

  if (error) return 'erro' // tabela ausente / falha — não pausar a IA à toa
  if (!data) return 'humano' // id desconhecido = humano respondeu
  return data.origem as OrigemEnvio
}

/** Registra a mensagem de um humano (para virar contexto). Best-effort. */
export async function registrarHumano(
  telefone: string,
  msgId: string | undefined,
  texto?: string,
): Promise<void> {
  await registrarMensagemEnviada(telefone, msgId, 'humano', texto ?? null)
}

const IDADE_MAX_CONTEXTO_MS = 72 * 3_600_000

/** True se a mensagem foi enviada nas últimas 72h (ainda vale como contexto). */
export function mensagemRecente(criadoEm: string, agora: Date = new Date()): boolean {
  // criado_em pode vir sem fuso (timestamp naive do Postgres) — trata como UTC.
  const iso = /[zZ]|[+-]\d{2}:?\d{2}$/.test(criadoEm) ? criadoEm : `${criadoEm}Z`
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return false
  return agora.getTime() - t <= IDADE_MAX_CONTEXTO_MS
}

/**
 * Devolve o contexto pendente (mensagens do sistema/humano ainda não injetadas)
 * e as marca como consumidas. Vazio se não houver nada.
 */
export async function contextoPendente(telefone: string): Promise<string> {
  const tel = normalizar(telefone)
  try {
    const { data } = await supabase
      .from('agente_mensagens_enviadas')
      .select('id, origem, texto, criado_em')
      .eq('telefone', tel)
      .eq('consumido', false)
      .in('origem', ['sistema', 'humano'])
      .not('texto', 'is', null)
      .order('criado_em', { ascending: true })

    const rows = data ?? []
    if (rows.length === 0) return ''

    // Mensagem velha não é contexto: sem esse corte, uma confirmação de semanas
    // atrás era despejada no próximo contato como se fosse atual (caso real:
    // Valeska, 02/10/2026 — IA citou "Jade marcada pra 21/09" já passada).
    // As velhas são marcadas como consumidas igual, só não entram no prompt.
    const recentes = rows.filter((r) => mensagemRecente(r.criado_em as string))

    await supabase
      .from('agente_mensagens_enviadas')
      .update({ consumido: true })
      .in('id', rows.map((r) => r.id))

    const linhas = recentes.map((r) => {
      const quem = r.origem === 'humano' ? 'Atendente humano enviou' : 'Sistema enviou ao cliente'
      return `- ${quem}: "${(r.texto as string).replace(/\s+/g, ' ').trim()}"`
    })

    return linhas.join('\n')
  } catch {
    return ''
  }
}

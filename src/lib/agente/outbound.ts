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

export type OrigemEnvio = 'ia' | 'sistema' | 'humano'

function normalizar(telefone: string): string {
  const d = telefone.replace(/\D/g, '')
  return d.startsWith('55') ? d : `55${d}`
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

    const linhas = rows.map((r) => {
      const quem = r.origem === 'humano' ? 'Atendente humano enviou' : 'Sistema enviou ao cliente'
      return `- ${quem}: "${(r.texto as string).replace(/\s+/g, ' ').trim()}"`
    })

    await supabase
      .from('agente_mensagens_enviadas')
      .update({ consumido: true })
      .in('id', rows.map((r) => r.id))

    return linhas.join('\n')
  } catch {
    return ''
  }
}

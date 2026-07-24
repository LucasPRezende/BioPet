/**
 * Dispatcher de provedor do agente — escolhe entre o caminho nativo Anthropic
 * (produção) e o OpenRouter (para testar outro modelo, ex.: Kimi) via a env
 * var AGENTE_MODELO_OPENROUTER.
 *
 * Vazia/ausente → usa `responder()` da Anthropic, sem NENHUMA mudança de
 * comportamento (é o caminho de sempre). Setada (ex.: "moonshotai/kimi-k3")
 * → roteia pelo OpenRouter com esse modelo.
 *
 * Isolado neste arquivo para que produção (que nunca seta essa env var)
 * jamais dependa do código do OpenRouter — só o dev, ao configurar a flag,
 * entra nesse caminho.
 */
import { responder as responderAnthropic, type ResponderDeps, type RespostaOrquestrador } from './orquestrador'
import { responderOpenRouter } from './orquestrador-openrouter'

/**
 * O histórico persistido (`conversas.historico`) é gravado no dialeto de
 * mensagem do provedor que respondeu por último: Anthropic usa `content` como
 * array de blocos (text/tool_use/tool_result); OpenAI/OpenRouter usa `content`
 * como string (ou null nas chamadas de tool). São formatos incompatíveis — um
 * histórico Anthropic entregue direto pro dialeto OpenAI (ou vice-versa) quebra
 * a chamada à API (já aconteceu: "message ... must not be empty" no Kimi).
 * Detecta pelo formato de `content`, não por um campo dedicado — evita
 * qualquer mudança de schema só para isso.
 */
function pareceHistoricoAnthropic(historico: any[]): boolean {
  return historico.some((m) => Array.isArray(m?.content))
}

export async function responder(
  telefone: string,
  textoUsuario: string,
  historicoOriginal: any[],
  deps: ResponderDeps = {},
): Promise<RespostaOrquestrador> {
  const modeloOpenRouter = process.env.AGENTE_MODELO_OPENROUTER?.trim()
  const usaOpenRouter = !!modeloOpenRouter

  const anthropicShaped = historicoOriginal.length > 0 && pareceHistoricoAnthropic(historicoOriginal)
  const incompativel = historicoOriginal.length > 0 && anthropicShaped !== !usaOpenRouter
  if (incompativel) {
    console.log(
      `[agente/provedor] histórico de ${telefone} está no dialeto errado para o provedor ativo ` +
        `(usaOpenRouter=${usaOpenRouter}) — reiniciando a conversa.`,
    )
  }
  const historico = incompativel ? [] : historicoOriginal

  if (!usaOpenRouter) return responderAnthropic(telefone, textoUsuario, historico, deps)

  const r = await responderOpenRouter(modeloOpenRouter, telefone, textoUsuario, historico, deps)
  return { resposta: r.resposta, historico: r.historico }
}

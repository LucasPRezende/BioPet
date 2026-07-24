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

export async function responder(
  telefone: string,
  textoUsuario: string,
  historico: any[],
  deps: ResponderDeps = {},
): Promise<RespostaOrquestrador> {
  const modeloOpenRouter = process.env.AGENTE_MODELO_OPENROUTER?.trim()
  if (!modeloOpenRouter) return responderAnthropic(telefone, textoUsuario, historico, deps)

  const r = await responderOpenRouter(modeloOpenRouter, telefone, textoUsuario, historico, deps)
  return { resposta: r.resposta, historico: r.historico }
}

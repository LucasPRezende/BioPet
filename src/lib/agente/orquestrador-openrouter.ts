/**
 * Orquestrador alternativo via OpenRouter (API compatível com OpenAI), para
 * usar outros modelos (Kimi, DeepSeek…) no lugar do Claude nativo.
 *
 * Reaproveita as MESMAS tools, o MESMO system prompt e o MESMO executor de
 * tools do orquestrador de produção — só muda o "dialeto" da API (tool calling
 * no formato OpenAI: tool_calls / role:'tool'). Usado tanto pela suíte de
 * comparação de modelos quanto pelo flag AGENTE_MODELO_OPENROUTER (ver
 * responder-provedor.ts) para testar um modelo em produção sem tocar no
 * caminho nativo da Anthropic.
 *
 * Requer OPENROUTER_API_KEY no ambiente.
 */
import {
  TOOLS,
  systemEstavel,
  systemVolatil,
  paraWhatsApp,
  executarTool,
  type ResponderDeps,
} from './orquestrador'

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
const MAX_RODADAS = 6

/** Converte as tools (formato Anthropic) para o formato de função da OpenAI. */
function toolsOpenAI() {
  return TOOLS.map((t) => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.input_schema },
  }))
}

export interface UsoModelo {
  promptTokens: number
  completionTokens: number
  custoUSD: number
}

export interface RespostaModelo {
  resposta: string
  historico: any[]
  uso: UsoModelo
}

/** Loga o consumo de uma resposta via OpenRouter (custo já vem calculado pela API). */
function logUsoOpenRouter(modelo: string, uso: UsoModelo, rodadas: number): void {
  console.log(
    `[agente/uso-openrouter] modelo=${modelo} rodadas=${rodadas} ` +
      `prompt=${uso.promptTokens} completion=${uso.completionTokens} custo=$${uso.custoUSD.toFixed(5)}`,
  )
}

/**
 * Mesma semântica de `responder` (orquestrador.ts), mas via OpenRouter.
 * `historico` é o array de mensagens no formato OpenAI (system + user/assistant/tool).
 *
 * O system message é RECONSTRUÍDO A CADA CHAMADA (nunca reaproveitado do
 * histórico) — mesmo comportamento do caminho Anthropic, necessário porque
 * ele carrega informação que muda a cada turno (hora atual, contexto pendente,
 * FAQ, exames não agendáveis). Sem isso, uma conversa longa arrastaria a hora
 * da PRIMEIRA mensagem para sempre.
 */
export async function responderOpenRouter(
  model: string,
  telefone: string,
  textoUsuario: string,
  historico: any[],
  deps: ResponderDeps = {},
): Promise<RespostaModelo> {
  const key = process.env.OPENROUTER_API_KEY
  if (!key) throw new Error('OPENROUTER_API_KEY ausente')

  const executar = deps.executar ?? executarTool
  const primeira = historico.length === 0
  const systemMsg = {
    role: 'system',
    content: `${systemEstavel()}\n\n${systemVolatil(telefone, primeira, deps.contexto, deps.faq, deps.examesNaoAgendaveis, deps.infoCliente)}`,
  }

  const semSystem = historico.filter((m) => m.role !== 'system')
  const messages: any[] = [systemMsg, ...semSystem, { role: 'user', content: textoUsuario }]

  const tools = toolsOpenAI()
  const uso: UsoModelo = { promptTokens: 0, completionTokens: 0, custoUSD: 0 }

  // Último texto não-vazio visto em QUALQUER rodada (mesmo as que chamaram
  // tool) — rede de segurança se a rodada final vier vazia (ver abaixo).
  let ultimoTextoNaoVazio = ''

  for (let rodada = 0; rodada < MAX_RODADAS; rodada++) {
    const res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, tools, usage: { include: true } }),
    })
    const j: any = await res.json().catch(() => null)
    if (!res.ok || !j || j.error) {
      throw new Error(`OpenRouter ${res.status}: ${JSON.stringify(j?.error ?? j)?.slice(0, 300)}`)
    }

    const u = j.usage ?? {}
    uso.promptTokens += u.prompt_tokens ?? 0
    uso.completionTokens += u.completion_tokens ?? 0
    uso.custoUSD += u.cost ?? 0

    const choice = j.choices?.[0]
    const msg = choice?.message ?? {}
    messages.push(msg)

    const textoDaRodada = (typeof msg.content === 'string' ? msg.content : '').trim()
    if (textoDaRodada) ultimoTextoNaoVazio = textoDaRodada

    if (choice?.finish_reason === 'tool_calls' && Array.isArray(msg.tool_calls) && msg.tool_calls.length) {
      for (const tc of msg.tool_calls) {
        let args: Record<string, any> = {}
        try { args = JSON.parse(tc.function?.arguments || '{}') } catch { /* ignora */ }
        const out = await executar(tc.function?.name, args, telefone)
        messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(out) })
      }
      continue
    }

    logUsoOpenRouter(model, uso, rodada + 1)

    // Rodada final sem texto: recupera o último texto não-vazio do turno
    // (pode ter sido uma pergunta de verdade que veio junto com uma tool
    // call de rodada anterior e nunca chegou ao cliente). Só escala se o
    // turno INTEIRO não gerou texto nenhum, em rodada nenhuma.
    const textoFinal = textoDaRodada || ultimoTextoNaoVazio

    if (!textoFinal) {
      // Turno inteiro sem nenhum texto gerado (não é "excedeu rodadas") —
      // escala de verdade em vez de deixar o cliente sem resposta e a
      // equipe sem saber. Mesma lógica do caminho Anthropic.
      await executar(
        'transferir_humano',
        { motivo: 'ia_travou', resumo: `IA terminou o turno sem responder ao atender: "${textoUsuario.slice(0, 200)}"` },
        telefone,
      ).catch(() => {})
      return {
        resposta: 'Desculpe, tive uma dificuldade aqui. Vou pedir para um atendente te responder. 🙏',
        historico: messages,
        uso,
      }
    }

    return { resposta: paraWhatsApp(textoFinal), historico: messages, uso }
  }

  logUsoOpenRouter(model, uso, MAX_RODADAS)
  await executar(
    'transferir_humano',
    { motivo: 'ia_travou', resumo: `IA excedeu o limite de rodadas ao atender: "${textoUsuario.slice(0, 200)}"` },
    telefone,
  ).catch(() => {})
  return {
    resposta: 'Desculpe, tive uma dificuldade aqui. Vou pedir para um atendente te responder. 🙏',
    historico: messages,
    uso,
  }
}

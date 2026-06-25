/**
 * EXPERIMENTAL — orquestrador alternativo via OpenRouter (API compatível com
 * OpenAI), para comparar outros modelos (DeepSeek, MiniMax…) com o Haiku.
 *
 * Reaproveita as MESMAS tools, o MESMO system prompt e o MESMO executor de
 * tools do orquestrador de produção — só muda o "dialeto" da API (tool calling
 * no formato OpenAI: tool_calls / role:'tool'). NÃO é usado em produção; serve
 * para rodar a suíte comportamental contra vários modelos e medir custo.
 *
 * Requer OPENROUTER_API_KEY no ambiente.
 */
import { TOOLS, systemEstavel, systemVolatil, paraWhatsApp, type ToolExecutor } from './orquestrador'

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

/**
 * Mesma semântica de `responder`, mas via OpenRouter. `historico` é o array de
 * mensagens no formato OpenAI (inclui a system message na primeira posição).
 */
export async function responderOpenRouter(
  model: string,
  telefone: string,
  textoUsuario: string,
  historico: any[],
  deps: { executar: ToolExecutor },
): Promise<RespostaModelo> {
  const key = process.env.OPENROUTER_API_KEY
  if (!key) throw new Error('OPENROUTER_API_KEY ausente')

  const messages: any[] =
    historico.length > 0
      ? [...historico]
      : [{ role: 'system', content: `${systemEstavel()}\n\n${systemVolatil(telefone, true)}` }]
  messages.push({ role: 'user', content: textoUsuario })

  const tools = toolsOpenAI()
  const uso: UsoModelo = { promptTokens: 0, completionTokens: 0, custoUSD: 0 }

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

    if (choice?.finish_reason === 'tool_calls' && Array.isArray(msg.tool_calls) && msg.tool_calls.length) {
      for (const tc of msg.tool_calls) {
        let args: Record<string, any> = {}
        try { args = JSON.parse(tc.function?.arguments || '{}') } catch { /* ignora */ }
        const out = await deps.executar(tc.function?.name, args, telefone)
        messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(out) })
      }
      continue
    }

    const texto = typeof msg.content === 'string' ? msg.content : ''
    return { resposta: paraWhatsApp(texto) || '(sem texto)', historico: messages, uso }
  }

  return { resposta: '(excedeu rodadas)', historico: messages, uso }
}

import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Regressão: quando o modelo termina o turno sem gerar NENHUM texto (não é
 * "excedeu rodadas" — é um turno vazio de verdade, já visto de verdade com o
 * Haiku em produção), o sistema tem que escalar via transferir_humano em vez
 * de só devolver uma desculpa genérica e deixar a equipe sem saber.
 */

const mockCreate = vi.fn()
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn(function AnthropicMock(this: any) {
    this.messages = { create: mockCreate }
  }),
}))

import { responder } from '@/lib/agente/orquestrador'
import { responderOpenRouter } from '@/lib/agente/orquestrador-openrouter'

const TEL = '5524999999999'

beforeEach(() => {
  mockCreate.mockReset()
  process.env.ANTHROPIC_API_KEY = 'sk-ant-fake'
  process.env.OPENROUTER_API_KEY = 'sk-or-fake'
})

describe('turno vazio (Anthropic) → escala em vez de só desculpar', () => {
  it('content sem nenhum bloco de texto → chama transferir_humano e avisa que vai escalar', async () => {
    mockCreate.mockResolvedValue({
      stop_reason: 'end_turn',
      content: [],
      usage: { input_tokens: 10, output_tokens: 1 },
    })
    const chamadas: { nome: string; input: any }[] = []
    const executar = async (nome: string, input: any) => {
      chamadas.push({ nome, input })
      return { sucesso: true }
    }

    const r = await responder(TEL, 'oi', [], { executar })

    expect(chamadas).toHaveLength(1)
    expect(chamadas[0].nome).toBe('transferir_humano')
    expect(chamadas[0].input.motivo).toBe('ia_travou')
    expect(r.resposta).toMatch(/atendente/i)
  })

  it('texto normal (não vazio) → NÃO escala', async () => {
    mockCreate.mockResolvedValue({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'Olá! Como posso ajudar?' }],
      usage: { input_tokens: 10, output_tokens: 5 },
    })
    const executar = vi.fn(async () => ({ sucesso: true }))

    const r = await responder(TEL, 'oi', [], { executar })

    expect(executar).not.toHaveBeenCalled()
    expect(r.resposta).toBe('Olá! Como posso ajudar?')
  })

  // Caso real (Katia, produção, 27/07): rodada 1 tem texto ("qual é o nome do
  // pet?") JUNTO com uma tool call (cadastrar_tutor) — esse texto nunca
  // chegava ao cliente antes. Rodada 2 (final) vem vazia. Em vez de escalar,
  // recupera o texto da rodada 1 — o cliente recebe a pergunta de verdade.
  it('rodada c/ texto+tool seguida de rodada final vazia → recupera o texto da rodada anterior (NÃO escala)', async () => {
    mockCreate
      .mockResolvedValueOnce({
        stop_reason: 'tool_use',
        content: [
          { type: 'text', text: 'Perfeito, Katia! Agora preciso dos dados do seu pet. Qual é o nome dele?' },
          { type: 'tool_use', id: 'tool1', name: 'cadastrar_tutor', input: { nome: 'Katia Maciel' } },
        ],
        usage: { input_tokens: 10, output_tokens: 20 },
      })
      .mockResolvedValueOnce({
        stop_reason: 'end_turn',
        content: [],
        usage: { input_tokens: 10, output_tokens: 1 },
      })

    const chamadas: string[] = []
    const executar = async (nome: string) => {
      chamadas.push(nome)
      return { id: 215, nome: 'Katia Maciel' }
    }

    const r = await responder(TEL, 'Katia Maciel', [], { executar })

    expect(chamadas).toEqual(['cadastrar_tutor']) // NÃO chamou transferir_humano
    expect(r.resposta).toBe('Perfeito, Katia! Agora preciso dos dados do seu pet. Qual é o nome dele?')
  })
})

describe('turno vazio (OpenRouter) → escala em vez de só desculpar', () => {
  const fetchOriginal = global.fetch

  it('message.content vazio, sem tool_calls → chama transferir_humano', async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{ finish_reason: 'stop', message: { content: '' } }],
        usage: { prompt_tokens: 10, completion_tokens: 0, cost: 0.0001 },
      }),
    })) as any

    const chamadas: { nome: string; input: any }[] = []
    const executar = async (nome: string, input: any) => {
      chamadas.push({ nome, input })
      return { sucesso: true }
    }

    const r = await responderOpenRouter('moonshotai/kimi-k3', TEL, 'oi', [], { executar })

    expect(chamadas).toHaveLength(1)
    expect(chamadas[0].nome).toBe('transferir_humano')
    expect(r.resposta).toMatch(/atendente/i)

    global.fetch = fetchOriginal
  })

  it('rodada c/ texto+tool_calls seguida de rodada final vazia → recupera o texto anterior (NÃO escala)', async () => {
    let chamada = 0
    global.fetch = vi.fn(async () => {
      chamada++
      if (chamada === 1) {
        return {
          ok: true,
          json: async () => ({
            choices: [{
              finish_reason: 'tool_calls',
              message: {
                content: 'Perfeito, Katia! Agora preciso dos dados do seu pet. Qual é o nome dele?',
                tool_calls: [{ id: 'tool1', function: { name: 'cadastrar_tutor', arguments: '{"nome":"Katia Maciel"}' } }],
              },
            }],
            usage: { prompt_tokens: 10, completion_tokens: 20, cost: 0.001 },
          }),
        }
      }
      return {
        ok: true,
        json: async () => ({
          choices: [{ finish_reason: 'stop', message: { content: '' } }],
          usage: { prompt_tokens: 10, completion_tokens: 1, cost: 0.0001 },
        }),
      }
    }) as any

    const chamadas: string[] = []
    const executar = async (nome: string) => {
      chamadas.push(nome)
      return { id: 215, nome: 'Katia Maciel' }
    }

    const r = await responderOpenRouter('moonshotai/kimi-k3', TEL, 'Katia Maciel', [], { executar })

    expect(chamadas).toEqual(['cadastrar_tutor']) // NÃO chamou transferir_humano
    expect(r.resposta).toBe('Perfeito, Katia! Agora preciso dos dados do seu pet. Qual é o nome dele?')

    global.fetch = fetchOriginal
  })
})

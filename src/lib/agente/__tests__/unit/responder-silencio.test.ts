import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockCreate = vi.fn()
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn(function AnthropicMock(this: any) {
    this.messages = { create: mockCreate }
  }),
}))

import { responder } from '@/lib/agente/orquestrador'
import { TEXTO_HISTORICO_SILENCIO } from '@/lib/agente/escalada-silenciosa'

const TEL = '5524999999999'
const usage = { input_tokens: 10, output_tokens: 5 }

describe('responder() com escalada silenciosa (modelo simulado)', () => {
  beforeEach(() => {
    mockCreate.mockReset()
    process.env.ANTHROPIC_API_KEY = 'sk-ant-fake'
  })

  it('assunto pessoal → transfere em silêncio, resposta vazia e histórico sem texto inventado', async () => {
    mockCreate
      .mockResolvedValueOnce({
        stop_reason: 'tool_use',
        content: [
          {
            type: 'tool_use',
            id: 't1',
            name: 'transferir_humano',
            input: { motivo: 'ia_travou', silencioso: true, resumo: 'ASSUNTO PESSOAL: projeto da Luciana' },
          },
        ],
        usage,
      })
      .mockResolvedValueOnce({
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'Claro, sem problema! Fico à disposição.' }],
        usage,
      })
    const executar = vi.fn(async () => ({ sucesso: true }))

    const r = await responder(TEL, 'Luciana, desculpa a demora com o projeto', [], { executar })

    expect(r.resposta).toBe('')
    expect(executar).toHaveBeenCalledTimes(1)
    const ultima = r.historico[r.historico.length - 1]
    expect(JSON.stringify(ultima)).toContain(TEXTO_HISTORICO_SILENCIO.slice(0, 30))
    expect(JSON.stringify(r.historico)).not.toContain('Fico à disposição')
  })

  it('transferir_humano sem o flag continua respondendo ao cliente', async () => {
    mockCreate
      .mockResolvedValueOnce({
        stop_reason: 'tool_use',
        content: [{ type: 'tool_use', id: 't1', name: 'transferir_humano', input: { motivo: 'ia_travou', resumo: 'x' } }],
        usage,
      })
      .mockResolvedValueOnce({
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'Já avisei um atendente.' }],
        usage,
      })
    const executar = vi.fn(async () => ({ sucesso: true }))

    const r = await responder(TEL, 'quero falar com alguém', [], { executar })

    expect(r.resposta).toMatch(/atendente/)
  })
})

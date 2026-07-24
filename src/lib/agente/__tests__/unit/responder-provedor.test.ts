import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * Trava o flag AGENTE_MODELO_OPENROUTER: vazio/ausente → Anthropic (produção,
 * sem mudança de comportamento); setado → OpenRouter com o modelo indicado.
 */
const { responderAnthropic, responderOpenRouter } = vi.hoisted(() => ({
  responderAnthropic: vi.fn(async () => ({ resposta: 'oi (anthropic)', historico: [{ role: 'anthropic' }] })),
  responderOpenRouter: vi.fn(async () => ({
    resposta: 'oi (openrouter)',
    historico: [{ role: 'openrouter' }],
    uso: { promptTokens: 1, completionTokens: 1, custoUSD: 0.001 },
  })),
}))
vi.mock('@/lib/agente/orquestrador', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/agente/orquestrador')>()
  return { ...real, responder: responderAnthropic }
})
vi.mock('@/lib/agente/orquestrador-openrouter', () => ({ responderOpenRouter }))

import { responder } from '@/lib/agente/responder-provedor'

const TEL = '5524999999999'
const ORIGINAL_ENV = process.env.AGENTE_MODELO_OPENROUTER

beforeEach(() => {
  responderAnthropic.mockClear()
  responderOpenRouter.mockClear()
  delete process.env.AGENTE_MODELO_OPENROUTER
})
afterEach(() => {
  if (ORIGINAL_ENV === undefined) delete process.env.AGENTE_MODELO_OPENROUTER
  else process.env.AGENTE_MODELO_OPENROUTER = ORIGINAL_ENV
})

describe('responder-provedor (flag AGENTE_MODELO_OPENROUTER)', () => {
  it('flag ausente → usa o caminho Anthropic (produção inalterada)', async () => {
    const r = await responder(TEL, 'oi', [])
    expect(responderAnthropic).toHaveBeenCalledWith(TEL, 'oi', [], {})
    expect(responderOpenRouter).not.toHaveBeenCalled()
    expect(r).toEqual({ resposta: 'oi (anthropic)', historico: [{ role: 'anthropic' }] })
  })

  it('flag vazia (string em branco) → ainda usa Anthropic', async () => {
    process.env.AGENTE_MODELO_OPENROUTER = '   '
    await responder(TEL, 'oi', [])
    expect(responderAnthropic).toHaveBeenCalled()
    expect(responderOpenRouter).not.toHaveBeenCalled()
  })

  it('flag setada → roteia para OpenRouter com o modelo indicado', async () => {
    process.env.AGENTE_MODELO_OPENROUTER = 'moonshotai/kimi-k3'
    const deps = { faq: 'faq teste' }
    const r = await responder(TEL, 'oi', [], deps)
    expect(responderOpenRouter).toHaveBeenCalledWith('moonshotai/kimi-k3', TEL, 'oi', [], deps)
    expect(responderAnthropic).not.toHaveBeenCalled()
    // uso NÃO vaza pro retorno — mesma forma que o caminho Anthropic
    expect(r).toEqual({ resposta: 'oi (openrouter)', historico: [{ role: 'openrouter' }] })
  })
})

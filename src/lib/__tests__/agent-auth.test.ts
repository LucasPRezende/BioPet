import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { verifyAgentKey } from '@/lib/agent-auth'

/**
 * A AGENT_API_KEY autoriza cancelar/remarcar/enviar laudo escolhendo o telefone
 * do tutor. Estes testes travam as tres garantias: falha fechada sem env var,
 * recusa da chave queimada (a que vazou no bundle) e aceite so do valor exato.
 */

const CHAVE_BOA = 'a'.repeat(64)
const QUEIMADA = 'biopet_agent_2026'

function req(key?: string) {
  return new Request('http://localhost/api/agente/contexto', {
    headers: key ? { 'x-api-key': key } : {},
  }) as any
}

describe('verifyAgentKey', () => {
  const original = process.env.AGENT_API_KEY

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    process.env.AGENT_API_KEY = CHAVE_BOA
  })

  afterEach(() => {
    vi.restoreAllMocks()
    if (original === undefined) delete process.env.AGENT_API_KEY
    else process.env.AGENT_API_KEY = original
  })

  it('aceita a chave correta', () => {
    expect(verifyAgentKey(req(CHAVE_BOA))).toBe(true)
  })

  it('recusa chave errada, ausente ou vazia', () => {
    expect(verifyAgentKey(req('errada'))).toBe(false)
    expect(verifyAgentKey(req())).toBe(false)
    expect(verifyAgentKey(req(''))).toBe(false)
  })

  it('recusa prefixo da chave certa (nao compara por prefixo)', () => {
    expect(verifyAgentKey(req(CHAVE_BOA.slice(0, 32)))).toBe(false)
    expect(verifyAgentKey(req(CHAVE_BOA + 'x'))).toBe(false)
  })

  it('falha fechada quando AGENT_API_KEY nao esta configurada', () => {
    delete process.env.AGENT_API_KEY
    expect(verifyAgentKey(req(CHAVE_BOA))).toBe(false)
    expect(console.error).toHaveBeenCalled()
  })

  it('recusa a chave queimada mesmo que ela volte para o ambiente', () => {
    process.env.AGENT_API_KEY = QUEIMADA
    expect(verifyAgentKey(req(QUEIMADA))).toBe(false)
    expect(console.error).toHaveBeenCalled()
  })

  it('avisa (mas aceita) chave curta demais', () => {
    process.env.AGENT_API_KEY = 'curta123'
    expect(verifyAgentKey(req('curta123'))).toBe(true)
    expect(console.warn).toHaveBeenCalled()
  })
})

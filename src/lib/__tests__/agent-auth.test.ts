import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { verifyAgentKey, verifyAgentOrSystemSession } from '@/lib/agent-auth'

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

// ---------------------------------------------------------------------------
// Dupla porta: rotas de leitura (precos/configuracoes) aceitam o agente OU um
// admin logado — e mais ninguem. Antes eram abertas a internet inteira.
// ---------------------------------------------------------------------------

vi.mock('@/lib/system-auth', () => ({
  SESSION_COOKIE_NAME: 'sys_session',
  parseSystemSession: vi.fn(async (token: string) =>
    token === 'sessao-valida' ? { id: 1, role: 'admin' } : null,
  ),
}))

/** Request com cookie de sessao (e, opcionalmente, chave do agente). */
function reqCookie(cookie?: string, key?: string) {
  const headers: Record<string, string> = {}
  if (cookie) headers.cookie = `sys_session=${cookie}`
  if (key) headers['x-api-key'] = key
  const r = new Request('http://localhost/api/agente/precos', { headers }) as any
  // NextRequest expõe cookies.get(); o Request cru nao — adaptador minimo.
  r.cookies = {
    get: (n: string) => {
      const m = (headers.cookie ?? '').match(new RegExp(`${n}=([^;]+)`))
      return m ? { value: m[1] } : undefined
    },
  }
  return r
}

describe('verifyAgentOrSystemSession', () => {
  const original = process.env.AGENT_API_KEY

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    process.env.AGENT_API_KEY = CHAVE_BOA
  })

  afterEach(() => {
    vi.restoreAllMocks()
    if (original === undefined) delete process.env.AGENT_API_KEY
    else process.env.AGENT_API_KEY = original
  })

  it('aceita o agente pela chave, sem cookie', async () => {
    expect(await verifyAgentOrSystemSession(reqCookie(undefined, CHAVE_BOA))).toBe(true)
  })

  it('aceita o admin logado, sem chave', async () => {
    expect(await verifyAgentOrSystemSession(reqCookie('sessao-valida'))).toBe(true)
  })

  it('recusa anonimo — o caso que deixava a tabela de precos publica', async () => {
    expect(await verifyAgentOrSystemSession(reqCookie())).toBe(false)
  })

  it('recusa cookie de sessao invalido e chave errada', async () => {
    expect(await verifyAgentOrSystemSession(reqCookie('lixo'))).toBe(false)
    expect(await verifyAgentOrSystemSession(reqCookie(undefined, 'errada'))).toBe(false)
  })
})

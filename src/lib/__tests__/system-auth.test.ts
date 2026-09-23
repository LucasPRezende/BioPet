import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * O papel e o status da conta não podem morar só no cookie: um cookie vale 30
 * dias e o usuário nunca é obrigado a trocar a senha. Estes testes provam que
 * desativar ou rebaixar alguém derruba a sessão já aberta dentro do TTL do
 * cache (60s) — e que isso continua custando UMA consulta por usuário por TTL.
 */

process.env.AUTH_SECRET = 'segredo-de-teste'

// Linha atual de system_users, trocada pelos testes para simular o admin
// mexendo na conta enquanto a sessão da vítima está aberta.
let row: { senha_hash: string | null; role: string | null; ativo: boolean | null } | null = null
const maybeSingle = vi.fn(async () => ({ data: row }))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle }) }),
    }),
  },
}))

const HASH = 'pbkdf2:aa:bb'

// Cada teste importa os módulos do zero para começar com o cache vazio.
async function carregar() {
  vi.resetModules()
  return import('@/lib/system-auth')
}

beforeEach(() => {
  vi.useFakeTimers()
  maybeSingle.mockClear()
  row = { senha_hash: HASH, role: 'admin', ativo: true }
})

afterEach(() => {
  vi.useRealTimers()
})

// Passa do TTL de 60s do session-cache.
const expiraCache = () => vi.advanceTimersByTime(61_000)

describe('parseSystemSession', () => {
  it('aceita a sessão e devolve o papel do banco', async () => {
    const { createSystemSession, parseSystemSession } = await carregar()
    const token = await createSystemSession(1, 'admin', false)

    expect(await parseSystemSession(token)).toEqual({
      userId: 1,
      role: 'admin',
      primeiraSSenha: false,
    })
  })

  it('rejeita a sessão já aberta quando a conta é desativada', async () => {
    const { createSystemSession, parseSystemSession } = await carregar()
    const token = await createSystemSession(1, 'admin', false)
    expect(await parseSystemSession(token)).not.toBeNull()

    row = { senha_hash: HASH, role: 'admin', ativo: false }
    expiraCache()

    expect(await parseSystemSession(token)).toBeNull()
  })

  it('devolve o papel do banco, não o assinado no cookie, após rebaixamento', async () => {
    const { createSystemSession, parseSystemSession } = await carregar()
    // Token emitido enquanto ainda era admin — assinatura continua válida.
    const token = await createSystemSession(1, 'admin', false)

    row = { senha_hash: HASH, role: 'user', ativo: true }
    expiraCache()

    expect(await parseSystemSession(token)).toEqual({
      userId: 1,
      role: 'user',
      primeiraSSenha: false,
    })
  })

  it('rejeita a sessão quando ativo é nulo (mesmo critério do login)', async () => {
    const { createSystemSession, parseSystemSession } = await carregar()
    const token = await createSystemSession(1, 'admin', false)

    row = { senha_hash: HASH, role: 'admin', ativo: null }
    expiraCache()

    expect(await parseSystemSession(token)).toBeNull()
  })

  it('cai em user quando o papel do banco é desconhecido ou nulo', async () => {
    const { createSystemSession, parseSystemSession } = await carregar()
    const token = await createSystemSession(1, 'admin', false)

    row = { senha_hash: HASH, role: null, ativo: true }
    expiraCache()

    expect((await parseSystemSession(token))?.role).toBe('user')
  })

  it('rejeita token com o papel adulterado (HMAC não bate)', async () => {
    const { createSystemSession, parseSystemSession } = await carregar()
    row = { senha_hash: HASH, role: 'user', ativo: true }
    const token = await createSystemSession(1, 'user', false)

    const forjado = token.replace(':user:', ':admin:')

    expect(await parseSystemSession(forjado)).toBeNull()
  })

  it('rejeita quando o usuário não existe mais', async () => {
    const { createSystemSession, parseSystemSession } = await carregar()
    const token = await createSystemSession(1, 'admin', false)

    row = null
    expiraCache()

    expect(await parseSystemSession(token)).toBeNull()
  })

  it('faz uma única consulta por usuário a cada 60s', async () => {
    const { createSystemSession, parseSystemSession } = await carregar()
    const token = await createSystemSession(1, 'admin', false) // 1ª consulta (fresh)
    maybeSingle.mockClear()

    for (let i = 0; i < 5; i++) await parseSystemSession(token)
    expect(maybeSingle).toHaveBeenCalledTimes(0) // tudo servido pelo cache

    expiraCache()
    for (let i = 0; i < 5; i++) await parseSystemSession(token)
    expect(maybeSingle).toHaveBeenCalledTimes(1)
  })
})

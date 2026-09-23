import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * O login barra clínica inativa, mas isso só valia para sessões novas: o cookie
 * dura 7 dias e nada obriga a clínica a trocar a senha. Estes testes provam que
 * desativar uma clínica derruba a sessão já aberta dentro do TTL do cache (60s),
 * sem custo de consulta a mais.
 */

process.env.AUTH_SECRET = 'segredo-de-teste'

let row: { senha_hash: string | null; ativo: boolean | null } | null = null
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
  return import('@/lib/clinica-auth')
}

beforeEach(() => {
  vi.useFakeTimers()
  maybeSingle.mockClear()
  row = { senha_hash: HASH, ativo: true }
})

afterEach(() => {
  vi.useRealTimers()
})

// Passa do TTL de 60s do session-cache.
const expiraCache = () => vi.advanceTimersByTime(61_000)

describe('parseClinicaSession', () => {
  it('aceita a sessão de clínica ativa', async () => {
    const { createClinicaSession, parseClinicaSession } = await carregar()
    const token = await createClinicaSession(7, false)

    expect(await parseClinicaSession(token)).toEqual({
      clinicaId: 7,
      primeiraSenha: false,
    })
  })

  it('rejeita a sessão já aberta quando a clínica é desativada', async () => {
    const { createClinicaSession, parseClinicaSession } = await carregar()
    const token = await createClinicaSession(7, false)
    expect(await parseClinicaSession(token)).not.toBeNull()

    row = { senha_hash: HASH, ativo: false }
    expiraCache()

    expect(await parseClinicaSession(token)).toBeNull()
  })

  it('rejeita a sessão quando ativo é nulo (mesmo critério do login)', async () => {
    const { createClinicaSession, parseClinicaSession } = await carregar()
    const token = await createClinicaSession(7, false)

    row = { senha_hash: HASH, ativo: null }
    expiraCache()

    expect(await parseClinicaSession(token)).toBeNull()
  })

  it('rejeita quando a clínica não existe mais', async () => {
    const { createClinicaSession, parseClinicaSession } = await carregar()
    const token = await createClinicaSession(7, false)

    row = null
    expiraCache()

    expect(await parseClinicaSession(token)).toBeNull()
  })

  it('faz uma única consulta por clínica a cada 60s', async () => {
    const { createClinicaSession, parseClinicaSession } = await carregar()
    const token = await createClinicaSession(7, false) // 1ª consulta (fresh)
    maybeSingle.mockClear()

    for (let i = 0; i < 5; i++) await parseClinicaSession(token)
    expect(maybeSingle).toHaveBeenCalledTimes(0) // tudo servido pelo cache

    expiraCache()
    for (let i = 0; i < 5; i++) await parseClinicaSession(token)
    expect(maybeSingle).toHaveBeenCalledTimes(1)
  })
})

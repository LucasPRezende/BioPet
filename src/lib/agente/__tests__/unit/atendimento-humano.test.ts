import { describe, it, expect, vi, beforeEach } from 'vitest'

/** Builder encadeável que resolve como Promise (imita o PostgrestFilterBuilder). */
function makeBuilder(result: any) {
  const builder: any = {}
  for (const m of ['select', 'insert', 'update', 'upsert', 'eq', 'or', 'in', 'not', 'order', 'limit']) {
    builder[m] = vi.fn(() => builder)
  }
  builder.maybeSingle = vi.fn(() => Promise.resolve(result))
  builder.then = (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject)
  return builder
}

const fromMock = vi.fn()
vi.mock('@/lib/supabase', () => ({
  supabase: { from: (...args: any[]) => fromMock(...args) },
}))

import { emAtendimentoHumano, marcarAtendimentoHumano } from '@/lib/agente/conversa'

const TEL = '24981367482'
const TEL_NORM = '5524981367482'
const FUTURO = new Date(Date.now() + 60 * 60_000).toISOString()
const PASSADO = new Date(Date.now() - 60 * 60_000).toISOString()

/** Mapeia `supabase.from(tabela)` para o builder configurado nesse teste. */
function mockTabelas(builders: Record<string, ReturnType<typeof makeBuilder>>) {
  fromMock.mockImplementation((tabela: string) => builders[tabela] ?? makeBuilder({ data: null, error: null }))
}

beforeEach(() => {
  fromMock.mockReset()
})

describe('emAtendimentoHumano', () => {
  it('tutor pausado (dentro do prazo) e sem linha em conversas → true', () => {
    mockTabelas({
      tutores: makeBuilder({ data: { id: 98, atendimento_humano: true, atendimento_humano_ate: FUTURO } }),
      conversas: makeBuilder({ data: null }),
    })
    return expect(emAtendimentoHumano(TEL)).resolves.toBe(true)
  })

  it('não é tutor cadastrado, mas conversas tem pausa ativa → true (o bug que motivou o fix)', () => {
    const tutoresBuilder = makeBuilder({ data: null }) // não existe tutor pra esse telefone
    const conversasBuilder = makeBuilder({ data: { atendimento_humano_ate: FUTURO } })
    mockTabelas({ tutores: tutoresBuilder, conversas: conversasBuilder })

    return expect(emAtendimentoHumano(TEL)).resolves.toBe(true)
  })

  it('nenhuma das duas fontes pausada → false', () => {
    mockTabelas({
      tutores: makeBuilder({ data: { id: 98, atendimento_humano: false, atendimento_humano_ate: null } }),
      conversas: makeBuilder({ data: { atendimento_humano_ate: null } }),
    })
    return expect(emAtendimentoHumano(TEL)).resolves.toBe(false)
  })

  it('prazo do tutor expirado → auto-desbloqueia (false) e limpa o tutor', async () => {
    const tutoresBuilder = makeBuilder({ data: { id: 98, atendimento_humano: true, atendimento_humano_ate: PASSADO } })
    mockTabelas({ tutores: tutoresBuilder, conversas: makeBuilder({ data: null }) })

    const r = await emAtendimentoHumano(TEL)

    expect(r).toBe(false)
    expect(tutoresBuilder.update).toHaveBeenCalledWith({ atendimento_humano: false, atendimento_humano_ate: null })
  })

  it('prazo da conversa expirado → auto-desbloqueia (false) e limpa a conversa', async () => {
    const conversasBuilder = makeBuilder({ data: { atendimento_humano_ate: PASSADO } })
    mockTabelas({ tutores: makeBuilder({ data: null }), conversas: conversasBuilder })

    const r = await emAtendimentoHumano(TEL)

    expect(r).toBe(false)
    expect(conversasBuilder.update).toHaveBeenCalledWith({ atendimento_humano_ate: null })
  })
})

describe('marcarAtendimentoHumano', () => {
  it('grava a pausa em tutores E em conversas (telefone normalizado)', async () => {
    const configBuilder = makeBuilder({ data: { tempo_retorno_ia_horas: 24 } })
    const tutoresBuilder = makeBuilder({ data: null, error: null })
    const conversasBuilder = makeBuilder({ data: null, error: null })
    mockTabelas({ configuracoes_agente: configBuilder, tutores: tutoresBuilder, conversas: conversasBuilder })

    await marcarAtendimentoHumano(TEL)

    expect(tutoresBuilder.update).toHaveBeenCalledWith(
      expect.objectContaining({ atendimento_humano: true }),
    )
    expect(conversasBuilder.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ telefone: TEL_NORM }),
      { onConflict: 'telefone' },
    )
  })

  it('sem config de tempo_retorno_ia_horas, usa default de 2 horas', async () => {
    const conversasBuilder = makeBuilder({ data: null, error: null })
    mockTabelas({
      configuracoes_agente: makeBuilder({ data: null }),
      tutores: makeBuilder({ data: null, error: null }),
      conversas: conversasBuilder,
    })

    const antes = Date.now()
    await marcarAtendimentoHumano(TEL)

    const chamada = conversasBuilder.upsert.mock.calls[0][0]
    const ateMs = new Date(chamada.atendimento_humano_ate).getTime()
    // ~2h à frente (com folga de alguns segundos pro tempo de execução do teste)
    expect(ateMs).toBeGreaterThan(antes + 2 * 3_600_000 - 5_000)
    expect(ateMs).toBeLessThan(antes + 2 * 3_600_000 + 5_000)
  })
})

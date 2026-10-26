import { describe, it, expect, vi, beforeEach } from 'vitest'

// Banco falso mínimo: cada tabela devolve as linhas configuradas (ignorando
// filtros); updates e chamadas de função ficam registrados para conferir.
const banco = {
  tabelas: {} as Record<string, unknown[]>,
  updates: [] as { tabela: string; valores: Record<string, unknown> }[],
  rpcs:    [] as { fn: string; args: Record<string, unknown> }[],
  custoPorConsumivel: {} as Record<number, number>,
}

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (tabela: string) => {
      const b: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'in', 'not', 'is', 'gt', 'gte', 'order']) b[m] = () => b
      b.update = (valores: Record<string, unknown>) => { banco.updates.push({ tabela, valores }); return b }
      b.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: banco.tabelas[tabela] ?? [], error: null }).then(ok)
      return b
    },
    rpc: async (fn: string, args: Record<string, unknown>) => {
      banco.rpcs.push({ fn, args })
      return { data: banco.custoPorConsumivel[args.p_consumivel_id as number] ?? 0, error: null }
    },
  },
}))

import { consumoPcrs, consumoTestesRapidos, baixarConsumoLaudo } from '@/lib/estoque'

beforeEach(() => {
  banco.tabelas = {}
  banco.updates = []
  banco.rpcs = []
  banco.custoPorConsumivel = {}
})

describe('consumo do laudo de PCR', () => {
  it('"FIV e FeLV" gasta o kit de FIV e o de FeLV', async () => {
    banco.tabelas.exame_pcr_consumiveis = [
      { pcr_id: 2, consumivel_id: 20, quantidade: 1, exames_pcr: { nome: 'FIV' } },
      { pcr_id: 4, consumivel_id: 20, quantidade: 1, exames_pcr: { nome: 'FIV e FeLV' } },
      { pcr_id: 4, consumivel_id: 30, quantidade: 1, exames_pcr: { nome: 'FIV e FeLV' } },
    ]
    expect(await consumoPcrs([4])).toEqual(new Map([[20, 1], [30, 1]]))
  })

  it('laudo sem PCR marcado não consulta nem gasta nada', async () => {
    expect(await consumoPcrs([])).toEqual(new Map())
  })
})

describe('consumo do laudo de teste rápido', () => {
  it('1 kit do consumível ligado a cada teste', async () => {
    banco.tabelas.testes_rapidos = [
      { id: 1, nome: 'Snap 4Dx', ativo: true, consumivel_id: 10 },
      { id: 2, nome: 'Giardia',  ativo: true, consumivel_id: 11 },
    ]
    expect(await consumoTestesRapidos([1, 2])).toEqual(new Map([[10, 1], [11, 1]]))
  })
})

describe('baixarConsumoLaudo', () => {
  it('dá uma saída por kit, ligada ao laudo, e grava o custo somado no laudo', async () => {
    banco.custoPorConsumivel = { 20: 45.5, 30: 38.25 }
    const custo = await baixarConsumoLaudo(77, new Map([[20, 1], [30, 1]]), 5)

    expect(custo).toBe(83.75)
    expect(banco.rpcs.map(r => r.fn)).toEqual(['consumir_estoque', 'consumir_estoque'])
    expect(banco.rpcs[0].args).toMatchObject({ p_consumivel_id: 20, p_quantidade: 1, p_tipo: 'consumo', p_laudo_id: 77, p_user_id: 5 })
    expect(banco.updates).toEqual([{ tabela: 'laudos', valores: { custo_exame: 83.75 } }])
  })

  it('sem consumo não mexe no estoque nem no laudo', async () => {
    expect(await baixarConsumoLaudo(77, new Map(), 5)).toBe(0)
    expect(banco.rpcs).toEqual([])
    expect(banco.updates).toEqual([])
  })
})

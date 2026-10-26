import { describe, it, expect } from 'vitest'
import { somarConsumo, montarReservas, juntarReservas, precisaRepor, type Vinculo, type ItemAgendado } from '@/lib/estoque-regras'

// Catálogo de exemplo: teste rápido 1 → kit 10; PCR "FIV" (2) → kit 20;
// PCR "FeLV" (3) → kit 30; PCR "FIV e FeLV" (4) → kits 20 e 30; PCR 5 sem kit.
const vinculos: Vinculo[] = [
  { item_id: 1, consumivel_id: 10, quantidade: 1 },
  { item_id: 2, consumivel_id: 20, quantidade: 1 },
  { item_id: 3, consumivel_id: 30, quantidade: 1 },
  { item_id: 4, consumivel_id: 20, quantidade: 1 },
  { item_id: 4, consumivel_id: 30, quantidade: 1 },
]

const ag = (agendamento_id: number, item_id: number, data_hora: string): ItemAgendado =>
  ({ agendamento_id, item_id, data_hora, pet_nome: `Pet ${agendamento_id}` })

describe('somarConsumo — quanto cada laudo gasta', () => {
  it('cada item gasta os kits ligados a ele', () => {
    expect(somarConsumo([1], vinculos)).toEqual(new Map([[10, 1]]))
  })

  it('combinação gasta um de cada kit (FIV e FeLV → kit de FIV + kit de FeLV)', () => {
    expect(somarConsumo([4], vinculos)).toEqual(new Map([[20, 1], [30, 1]]))
  })

  it('itens que usam o mesmo kit somam', () => {
    expect(somarConsumo([2, 4], vinculos)).toEqual(new Map([[20, 2], [30, 1]]))
  })

  it('item repetido conta de novo', () => {
    expect(somarConsumo([1, 1], vinculos)).toEqual(new Map([[10, 2]]))
  })

  it('item sem kit vinculado não gasta nada', () => {
    expect(somarConsumo([5], vinculos)).toEqual(new Map())
  })

  it('respeita a quantidade do vínculo', () => {
    expect(somarConsumo([9], [{ item_id: 9, consumivel_id: 40, quantidade: 3 }])).toEqual(new Map([[40, 3]]))
  })
})

describe('montarReservas — kits comprometidos com agendamentos', () => {
  it('agendamento com laudo já emitido não reserva (o laudo já deu baixa)', () => {
    const r = montarReservas([ag(100, 1, '2026-10-27T10:00:00')], vinculos, new Set([100]))
    expect(r.size).toBe(0)
  })

  it('soma no mesmo agendamento quando dois itens usam o mesmo kit', () => {
    const r = montarReservas([ag(100, 2, '2026-10-27T10:00:00'), ag(100, 4, '2026-10-27T10:00:00')], vinculos, new Set())
    expect(r.get(20)).toEqual([{ agendamento_id: 100, data_hora: '2026-10-27T10:00:00', pet_nome: 'Pet 100', quantidade: 2 }])
    expect(r.get(30)?.[0].quantidade).toBe(1)
  })

  it('lista em ordem de data', () => {
    const r = montarReservas([ag(101, 1, '2026-10-29T09:00:00'), ag(100, 1, '2026-10-27T09:00:00')], vinculos, new Set())
    expect(r.get(10)?.map(x => x.agendamento_id)).toEqual([100, 101])
  })

  it('item sem kit não reserva nada', () => {
    expect(montarReservas([ag(100, 5, '2026-10-27T10:00:00')], vinculos, new Set()).size).toBe(0)
  })
})

describe('juntarReservas — teste rápido + PCR no mesmo kit', () => {
  it('junta as listas e reordena por data', () => {
    const a = new Map([[10, [{ agendamento_id: 2, data_hora: '2026-10-29T09:00:00', pet_nome: 'B', quantidade: 1 }]]])
    const b = new Map([[10, [{ agendamento_id: 1, data_hora: '2026-10-27T09:00:00', pet_nome: 'A', quantidade: 2 }]]])
    expect(juntarReservas(a, b).get(10)?.map(r => r.agendamento_id)).toEqual([1, 2])
  })
})

describe('precisaRepor', () => {
  it('vai faltar para os agendados', () => {
    expect(precisaRepor({ disponivel: -1, estoque_minimo: 0 })).toBe(true)
  })
  it('sobra no mínimo ou abaixo', () => {
    expect(precisaRepor({ disponivel: 3, estoque_minimo: 3 })).toBe(true)
    expect(precisaRepor({ disponivel: 4, estoque_minimo: 3 })).toBe(false)
  })
  it('sem mínimo definido e sem falta não alerta', () => {
    expect(precisaRepor({ disponivel: 0, estoque_minimo: 0 })).toBe(false)
  })
})

import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn() } }))

import { exameJaAconteceu } from '@/lib/agente/revisoes-disponiveis'

describe('exameJaAconteceu (data_hora naive em horário de Brasília)', () => {
  // Caso real 09/10/2026: agora = 08:18 em Brasília; exame às 09:30 do mesmo dia.
  // O bug comparava com o instante UTC (11:18Z) e achava que o exame já passou.
  it('exame 1h12 no futuro NÃO aconteceu ainda', () => {
    expect(exameJaAconteceu('2026-10-09T09:30:00', '2026-10-09T08:18:00')).toBe(false)
  })

  it('exame 2h59 no futuro (a janela do bug do fuso) NÃO aconteceu', () => {
    expect(exameJaAconteceu('2026-10-09T11:17:00', '2026-10-09T08:18:00')).toBe(false)
  })

  it('exame de ontem e exame de minutos atrás JÁ aconteceram', () => {
    expect(exameJaAconteceu('2026-10-08T15:00:00', '2026-10-09T08:18:00')).toBe(true)
    expect(exameJaAconteceu('2026-10-09T08:00:00', '2026-10-09T08:18:00')).toBe(true)
  })

  it('exatamente na hora conta como acontecido', () => {
    expect(exameJaAconteceu('2026-10-09T08:18:00', '2026-10-09T08:18:00')).toBe(true)
  })

  it('sem passar "agora", usa o relógio de Brasília (não lança)', () => {
    expect(typeof exameJaAconteceu('2020-01-01T10:00:00')).toBe('boolean')
    expect(exameJaAconteceu('2020-01-01T10:00:00')).toBe(true)
    expect(exameJaAconteceu('2099-01-01T10:00:00')).toBe(false)
  })
})

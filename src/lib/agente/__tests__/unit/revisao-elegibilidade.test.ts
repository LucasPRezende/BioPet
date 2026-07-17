import { describe, it, expect } from 'vitest'
import { calcularElegibilidadeRevisao } from '@/lib/revisao-elegibilidade'

const CONFIG = { prazo_dias: 30, max_revisoes: 1 }

describe('calcularElegibilidadeRevisao', () => {
  it('dentro do prazo e sem revisão feita → pode agendar', () => {
    const original = '2026-07-01T10:00:00'
    const agora = new Date('2026-07-15T00:00:00')
    const r = calcularElegibilidadeRevisao(original, CONFIG, 0, agora)
    expect(r.pode_agendar).toBe(true)
    expect(r.prazo_ok).toBe(true)
    expect(r.limite_ok).toBe(true)
  })

  it('prazo vencido → não pode agendar', () => {
    const original = '2026-06-01T10:00:00'
    const agora = new Date('2026-07-15T00:00:00') // 44 dias depois, prazo 30
    const r = calcularElegibilidadeRevisao(original, CONFIG, 0, agora)
    expect(r.pode_agendar).toBe(false)
    expect(r.prazo_ok).toBe(false)
    expect(r.limite_ok).toBe(true)
  })

  it('exatamente no limite do prazo (prazo_limite) ainda conta como ok', () => {
    const original = '2026-07-01T10:00:00'
    const agora = new Date('2026-07-31T10:00:00') // exatamente 30 dias depois
    const r = calcularElegibilidadeRevisao(original, CONFIG, 0, agora)
    expect(r.prazo_ok).toBe(true)
  })

  it('já atingiu o máximo de revisões → não pode agendar mesmo no prazo', () => {
    const original = '2026-07-01T10:00:00'
    const agora = new Date('2026-07-10T00:00:00')
    const r = calcularElegibilidadeRevisao(original, CONFIG, 1, agora)
    expect(r.pode_agendar).toBe(false)
    expect(r.prazo_ok).toBe(true)
    expect(r.limite_ok).toBe(false)
  })

  it('max_revisoes maior que 1 permite múltiplas revisões ativas', () => {
    const original = '2026-07-01T10:00:00'
    const agora = new Date('2026-07-10T00:00:00')
    const config2 = { prazo_dias: 30, max_revisoes: 2 }
    const r = calcularElegibilidadeRevisao(original, config2, 1, agora)
    expect(r.pode_agendar).toBe(true)
  })
})

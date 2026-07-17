import { describe, it, expect } from 'vitest'
import { calcularElegibilidadeRevisao, dentroJanelaComercial } from '@/lib/revisao-elegibilidade'

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

describe('dentroJanelaComercial', () => {
  const JANELA = ['08:00', '17:00'] as const
  const SEM_FERIADOS: string[] = []

  it('conta só o INÍCIO: 16:30 numa sexta é comercial mesmo que o exame termine depois das 17h (caso real do bug)', () => {
    expect(dentroJanelaComercial('2026-07-17T16:30:00', ...JANELA, SEM_FERIADOS)).toBe(true)
  })

  it('começar exatamente no fim da janela (17:00) já é fora', () => {
    expect(dentroJanelaComercial('2026-07-17T17:00:00', ...JANELA, SEM_FERIADOS)).toBe(false)
  })

  it('antes do início da janela é fora', () => {
    expect(dentroJanelaComercial('2026-07-17T07:59:00', ...JANELA, SEM_FERIADOS)).toBe(false)
  })

  it('sábado e domingo são fora, mesmo em horário de expediente', () => {
    expect(dentroJanelaComercial('2026-07-18T10:00:00', ...JANELA, SEM_FERIADOS)).toBe(false) // sábado
    expect(dentroJanelaComercial('2026-07-19T10:00:00', ...JANELA, SEM_FERIADOS)).toBe(false) // domingo
  })

  it('feriado listado é fora, mesmo em dia útil e horário de expediente', () => {
    expect(dentroJanelaComercial('2026-07-16T10:00:00', ...JANELA, ['2026-07-16'])).toBe(false)
  })
})

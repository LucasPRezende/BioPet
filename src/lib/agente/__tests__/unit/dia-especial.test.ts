import { describe, it, expect } from 'vitest'
import { infoDiaEspecial } from '@/lib/feriados'

const FERIADOS = [
  { data: '2026-10-12', nome: 'Nossa Senhora Aparecida' }, // segunda
  { data: '2026-09-07', nome: 'Independência do Brasil' }, // segunda
]

describe('infoDiaEspecial', () => {
  it('feriado em dia de semana (caso real 12/10/2026): dia inteiro especial, com nome e aviso', () => {
    const r = infoDiaEspecial('2026-10-12', FERIADOS)
    expect(r.dia_especial).toBe(true)
    expect(r.motivo_dia_especial).toBe('feriado')
    expect(r.feriado_nome).toBe('Nossa Senhora Aparecida')
    expect(r.aviso_dia_especial).toMatch(/FERIADO/)
    expect(r.aviso_dia_especial).toMatch(/Nossa Senhora Aparecida/)
    expect(r.aviso_dia_especial).toMatch(/fora_horario/)
  })

  it('sábado e domingo: fim de semana, sem nome de feriado', () => {
    for (const data of ['2026-10-10', '2026-10-11']) {
      const r = infoDiaEspecial(data, FERIADOS)
      expect(r.dia_especial).toBe(true)
      expect(r.motivo_dia_especial).toBe('fim_de_semana')
      expect(r.feriado_nome).toBeNull()
    }
  })

  it('feriado que cai no sábado continua sendo "feriado"', () => {
    const r = infoDiaEspecial('2026-10-10', [{ data: '2026-10-10', nome: 'Feriado local' }])
    expect(r.motivo_dia_especial).toBe('feriado')
    expect(r.feriado_nome).toBe('Feriado local')
  })

  it('dia útil comum: não é especial e não traz aviso', () => {
    const r = infoDiaEspecial('2026-10-13', FERIADOS) // terça
    expect(r).toEqual({
      dia_especial: false,
      motivo_dia_especial: null,
      feriado_nome: null,
      aviso_dia_especial: null,
    })
  })

  it('feriado sem nome cadastrado: ainda é feriado, só sem o nome', () => {
    const r = infoDiaEspecial('2026-10-12', [{ data: '2026-10-12' }])
    expect(r.dia_especial).toBe(true)
    expect(r.feriado_nome).toBeNull()
    expect(r.aviso_dia_especial).toMatch(/FERIADO/)
  })
})

import { describe, it, expect } from 'vitest'
import { normalizarEspecie, ESPECIES } from '@/lib/especies'

describe('normalizarEspecie', () => {
  it('mapeia sinônimos comuns para o valor canônico', () => {
    expect(normalizarEspecie('gato')).toBe('Felina')
    expect(normalizarEspecie('Gato')).toBe('Felina')
    expect(normalizarEspecie('felino')).toBe('Felina')
    expect(normalizarEspecie('cachorro')).toBe('Canina')
    expect(normalizarEspecie('cão')).toBe('Canina')
    expect(normalizarEspecie('cao')).toBe('Canina')
    expect(normalizarEspecie('coelho')).toBe('Lagomorfo')
    expect(normalizarEspecie('cavalo')).toBe('Equina')
    expect(normalizarEspecie('vaca')).toBe('Bovina')
  })

  it('aceita o próprio valor canônico em qualquer caixa/acentuação', () => {
    for (const e of ESPECIES) {
      expect(normalizarEspecie(e)).toBe(e)
      expect(normalizarEspecie(e.toLowerCase())).toBe(e)
    }
  })

  it('preserva texto desconhecido (não perde o dado)', () => {
    expect(normalizarEspecie('Iguana')).toBe('Iguana')
  })

  it('retorna null para vazio/nulo', () => {
    expect(normalizarEspecie(null)).toBeNull()
    expect(normalizarEspecie(undefined)).toBeNull()
    expect(normalizarEspecie('')).toBeNull()
  })

  it('ignora espaços nas bordas', () => {
    expect(normalizarEspecie('  gato  ')).toBe('Felina')
  })
})

import { describe, it, expect } from 'vitest'
import { sanitizeOrTerm, ilikeOrFilter } from '@/lib/search-utils'

describe('sanitizeOrTerm', () => {
  it('neutraliza os caracteres de controle do parser (vírgula e parênteses)', () => {
    expect(sanitizeOrTerm('a,id.gte.0')).toBe('a id.gte.0')
    expect(sanitizeOrTerm('a,or(token.ilike.%ab%)')).toBe('a or token.ilike.%ab%')
    expect(sanitizeOrTerm('(((')).toBe('')
    expect(sanitizeOrTerm(',,,')).toBe('')
  })

  it('preserva nomes legítimos com acento, hífen e ponto', () => {
    expect(sanitizeOrTerm('João')).toBe('João')
    expect(sanitizeOrTerm('Maria-Clara')).toBe('Maria-Clara')
    expect(sanitizeOrTerm('J.R. Conceição')).toBe('J.R. Conceição')
    expect(sanitizeOrTerm('  Ana   Paula  ')).toBe('Ana Paula')
  })
})

describe('ilikeOrFilter', () => {
  it('monta o filtro para cada coluna com o termo sanitizado', () => {
    expect(ilikeOrFilter(['nome_pet', 'tutor'], 'Rex'))
      .toBe('nome_pet.ilike.%Rex%,tutor.ilike.%Rex%')
    expect(ilikeOrFilter(['nome'], 'Núbia Sá'))
      .toBe('nome.ilike.%Núbia Sá%')
  })

  it('um termo com vírgula não injeta condição extra', () => {
    const injetado = ilikeOrFilter(['nome_pet', 'tutor'], 'a,id.gte.0')
    const inofensivo = ilikeOrFilter(['nome_pet', 'tutor'], 'a id.gte.0')
    expect(injetado).toBe(inofensivo)
    // o filtro tem exatamente uma condição por coluna — nada a mais
    expect(injetado!.split(',')).toHaveLength(2)
    expect(injetado).not.toContain('id.gte.0,')
  })

  it('devolve null quando o termo vira vazio (chamador não aplica filtro)', () => {
    expect(ilikeOrFilter(['nome'], ',,,')).toBeNull()
    expect(ilikeOrFilter(['nome'], '()')).toBeNull()
    expect(ilikeOrFilter(['nome'], '   ')).toBeNull()
  })
})

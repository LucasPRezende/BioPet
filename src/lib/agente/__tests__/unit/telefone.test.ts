import { describe, it, expect } from 'vitest'
import { normalizeTelefone } from '@/lib/telefone'

describe('normalizeTelefone', () => {
  it('prefixa 55 em número BR local (DDD + celular)', () => {
    expect(normalizeTelefone('24981367482')).toBe('5524981367482')
    expect(normalizeTelefone('(24) 98136-7482')).toBe('5524981367482')
  })

  it('prefixa 55 em número BR local fixo (DDD + 8 dígitos)', () => {
    expect(normalizeTelefone('2433481234')).toBe('552433481234')
  })

  it('mantém número BR que já tem o DDI 55', () => {
    expect(normalizeTelefone('5524981367482')).toBe('5524981367482')
    expect(normalizeTelefone('+55 24 98136-7482')).toBe('5524981367482')
  })

  it('NÃO prefixa 55 em número argentino com DDI 54', () => {
    expect(normalizeTelefone('+54 9 11 1234-5678')).toBe('5491112345678')
    expect(normalizeTelefone('5491112345678')).toBe('5491112345678')
  })

  it('respeita DDI explícito com "+" mesmo em números curtos', () => {
    expect(normalizeTelefone('+1 305 555 0100')).toBe('13055550100')
  })

  it('prefixa 55 em DDD 54/55 do RS (número local de 11 dígitos)', () => {
    // DDD 54 (Caxias do Sul) — local, sem DDI
    expect(normalizeTelefone('54991234567')).toBe('5554991234567')
  })

  it('retorna vazio para entrada vazia/nula', () => {
    expect(normalizeTelefone('')).toBe('')
    expect(normalizeTelefone(null)).toBe('')
    expect(normalizeTelefone(undefined)).toBe('')
  })
})

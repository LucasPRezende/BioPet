import { describe, it, expect } from 'vitest'
import { valorPorExtenso } from '@/lib/generate-recibo-pdf'

describe('valorPorExtenso', () => {
  it('valores simples', () => {
    expect(valorPorExtenso(1)).toBe('um real')
    expect(valorPorExtenso(21)).toBe('vinte e um reais')
    expect(valorPorExtenso(100)).toBe('cem reais')
    expect(valorPorExtenso(115)).toBe('cento e quinze reais')
    expect(valorPorExtenso(200)).toBe('duzentos reais')
    expect(valorPorExtenso(640)).toBe('seiscentos e quarenta reais')
    expect(valorPorExtenso(999)).toBe('novecentos e noventa e nove reais')
  })

  it('milhares', () => {
    expect(valorPorExtenso(1000)).toBe('mil reais')
    expect(valorPorExtenso(1001)).toBe('mil e um reais')
    expect(valorPorExtenso(1200)).toBe('mil e duzentos reais')
    expect(valorPorExtenso(1250)).toBe('mil duzentos e cinquenta reais')
    expect(valorPorExtenso(2530)).toBe('dois mil quinhentos e trinta reais')
    expect(valorPorExtenso(45000)).toBe('quarenta e cinco mil reais')
  })

  it('milhões', () => {
    expect(valorPorExtenso(1_000_000)).toBe('um milhão de reais')
    expect(valorPorExtenso(2_000_000)).toBe('dois milhões de reais')
    expect(valorPorExtenso(1_500_000)).toBe('um milhão quinhentos mil reais')
  })

  it('centavos', () => {
    expect(valorPorExtenso(0.5)).toBe('cinquenta centavos')
    expect(valorPorExtenso(0.01)).toBe('um centavo')
    expect(valorPorExtenso(640.75)).toBe('seiscentos e quarenta reais e setenta e cinco centavos')
    expect(valorPorExtenso(1.5)).toBe('um real e cinquenta centavos')
    // ponto flutuante: 219.90 → 90 centavos, não 89
    expect(valorPorExtenso(219.9)).toBe('duzentos e dezenove reais e noventa centavos')
  })

  it('zero', () => {
    expect(valorPorExtenso(0)).toBe('zero reais')
  })
})

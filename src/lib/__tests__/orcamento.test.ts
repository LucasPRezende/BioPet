import { describe, it, expect } from 'vitest'
import {
  calcularOrcamento, normalizarValidadeDias, validadeAte, hojeBrasilia,
  VALIDADE_PADRAO_DIAS, VALIDADE_MAX_DIAS,
} from '@/lib/orcamento'
import type { PrecoExame } from '@/lib/pricing'

const fixo: PrecoExame = {
  varia_por_horario: false,
  valor_pix: 200, valor_cartao: 220,
  valor_especial_pix: null, valor_especial_cartao: null,
}
const variavel: PrecoExame = {
  varia_por_horario: true,
  valor_pix: 250, valor_cartao: 275,
  valor_especial_pix: 350, valor_especial_cartao: 385,
}

describe('calcularOrcamento', () => {
  it('soma PIX e cartão pelo preço comercial da tabela', () => {
    const o = calcularOrcamento([
      { nome: 'Ultrassom', preco: variavel },
      { nome: 'Glicose', preco: fixo },
    ])
    expect(o.total_pix).toBe(450)
    expect(o.total_cartao).toBe(495)
    expect(o.linhas[0]).toMatchObject({ pix: 250, cartao: 275 })
  })

  it('exame que varia por horário traz o valor fora de horário à parte', () => {
    const o = calcularOrcamento([
      { nome: 'Ultrassom', preco: variavel },
      { nome: 'Glicose', preco: fixo },
    ])
    expect(o.linhas[0].especial).toEqual({ pix: 350, cartao: 385 })
    expect(o.linhas[1].especial).toBeNull()
    // exame fixo entra pelo comercial também no total especial
    expect(o.total_especial).toEqual({ pix: 550, cartao: 605 })
  })

  it('sem exame variável não há total especial', () => {
    const o = calcularOrcamento([{ nome: 'Glicose', preco: fixo }])
    expect(o.total_especial).toBeNull()
  })

  it('cartão cai para PIX quando a tabela não tem preço de cartão', () => {
    const o = calcularOrcamento([{ nome: 'X', preco: { ...fixo, valor_cartao: null } }])
    expect(o.total_cartao).toBe(200)
  })

  it('lista vazia dá zero', () => {
    const o = calcularOrcamento([])
    expect(o.total_pix).toBe(0)
    expect(o.total_cartao).toBe(0)
  })

  it('não acumula erro de ponto flutuante', () => {
    const p = { ...fixo, valor_pix: 0.1, valor_cartao: 0.1 }
    const o = calcularOrcamento([{ nome: 'a', preco: p }, { nome: 'b', preco: p }, { nome: 'c', preco: p }])
    expect(o.total_pix).toBe(0.3)
  })
})

describe('validade', () => {
  it('padrão de 15 dias quando vazio ou inválido', () => {
    expect(VALIDADE_PADRAO_DIAS).toBe(15)
    expect(normalizarValidadeDias(undefined)).toBe(15)
    expect(normalizarValidadeDias('abc')).toBe(15)
    expect(normalizarValidadeDias(0)).toBe(15)
    expect(normalizarValidadeDias(-3)).toBe(15)
  })

  it('aceita dias válidos e limita o máximo', () => {
    expect(normalizarValidadeDias(7)).toBe(7)
    expect(normalizarValidadeDias('30')).toBe(30)
    expect(normalizarValidadeDias(9999)).toBe(VALIDADE_MAX_DIAS)
  })

  it('validadeAte soma dias atravessando mês e ano', () => {
    expect(validadeAte('2026-11-18', 15)).toBe('2026-12-03')
    expect(validadeAte('2026-12-20', 15)).toBe('2027-01-04')
    expect(validadeAte('2028-02-20', 15)).toBe('2028-03-06') // ano bissexto
  })

  it('hojeBrasilia usa o fuso de Brasília (23h em SP ainda é o mesmo dia)', () => {
    // 2026-11-19T02:00Z = 18/11 23:00 em Brasília
    expect(hojeBrasilia(new Date('2026-11-19T02:00:00Z'))).toBe('2026-11-18')
  })
})

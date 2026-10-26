import { describe, it, expect, vi } from 'vitest'

// O módulo importa o client do Supabase; os testes só usam a parte pura.
vi.mock('../supabase', () => ({ supabase: {} }))

import {
  calcularSaldo, excedente, validarValor, validarDataPagamento,
  pessoaDoVet, chavePessoa, round2,
} from '../comissao-saldo'

describe('calcularSaldo', () => {
  it('saldo = inicial + devido − pago', () => {
    const s = calcularSaldo({ inicial: 15, devido: 100, pago: 40 })
    expect(s.saldo).toBe(75)
    expect(s.adiantamento).toBe(false)
  })

  it('pagar a mais vira adiantamento (saldo negativo)', () => {
    const s = calcularSaldo({ inicial: 0, devido: 50, pago: 80 })
    expect(s.saldo).toBe(-30)
    expect(s.adiantamento).toBe(true)
  })

  it('saldo zerado não é adiantamento', () => {
    expect(calcularSaldo({ inicial: 10, devido: 0, pago: 10 }).adiantamento).toBe(false)
  })

  it('não acumula erro de ponto flutuante', () => {
    const s = calcularSaldo({ inicial: 0.1, devido: 0.2, pago: 0.3 })
    expect(s.saldo).toBe(0)
  })
})

describe('excedente', () => {
  it('pagamento dentro do saldo não excede', () => {
    expect(excedente(100, 100)).toBe(0)
    expect(excedente(100, 40)).toBe(0)
  })
  it('pagamento acima do saldo devolve só a parte que passa', () => {
    expect(excedente(100, 130)).toBe(30)
  })
  it('com saldo zero ou já em adiantamento, tudo é excedente', () => {
    expect(excedente(0, 50)).toBe(50)
    expect(excedente(-20, 50)).toBe(50)
  })
})

describe('validarValor', () => {
  it('aceita número e string com vírgula', () => {
    expect(validarValor(12.5)).toEqual({ ok: true, valor: 12.5 })
    expect(validarValor('12,50')).toEqual({ ok: true, valor: 12.5 })
  })
  it('arredonda para centavos', () => {
    expect(validarValor(10.005)).toEqual({ ok: true, valor: round2(10.005) })
  })
  it.each([0, -5, 'abc', NaN, Infinity, null, undefined, 100_000.01])('rejeita %s', v => {
    expect(validarValor(v).ok).toBe(false)
  })
})

describe('validarDataPagamento', () => {
  const hoje = '2026-10-09'
  it('aceita hoje e passado', () => {
    expect(validarDataPagamento('2026-10-09', hoje).ok).toBe(true)
    expect(validarDataPagamento('2026-09-30', hoje).ok).toBe(true)
  })
  it('rejeita futuro e formato/data inexistente', () => {
    expect(validarDataPagamento('2026-10-10', hoje).ok).toBe(false)
    expect(validarDataPagamento('2026-02-30', hoje).ok).toBe(false)
    expect(validarDataPagamento('09/10/2026', hoje).ok).toBe(false)
    expect(validarDataPagamento(undefined, hoje).ok).toBe(false)
  })
})

describe('pessoaDoVet', () => {
  it('vet vinculado cai no usuário (saldo único)', () => {
    expect(pessoaDoVet({ id: 1, system_user_id: 7 })).toEqual({ tipo: 'usuario', id: 7 })
  })
  it('vet sem usuário fica separado', () => {
    expect(pessoaDoVet({ id: 1, system_user_id: null })).toEqual({ tipo: 'veterinario', id: 1 })
  })
  it('ids iguais de tipos diferentes têm chaves diferentes', () => {
    expect(chavePessoa({ tipo: 'usuario', id: 1 })).not.toBe(chavePessoa({ tipo: 'veterinario', id: 1 }))
  })
})

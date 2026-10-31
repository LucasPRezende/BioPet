import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase', () => ({ supabase: { from: () => ({}) } }))

import { pagamentoAdiantadoEmDinheiro, AVISO_PAGAMENTO_ADIANTADO } from '@/lib/agente/pagamento-adiantado'
import { executarTool } from '@/lib/agente/orquestrador'

describe('pagamentoAdiantadoEmDinheiro', () => {
  it('reconhece "já pagou/deixou pago em dinheiro" nas observações', () => {
    expect(pagamentoAdiantadoEmDinheiro('PAGAMENTO EM DINHEIRO NA CLÍNICA (preço PIX). Cliente já deixou pago R$180 em dinheiro.')).toBe(true)
    expect(pagamentoAdiantadoEmDinheiro('Pagamento já foi feito em dinheiro')).toBe(true)
  })

  it('dinheiro a pagar no dia NÃO é pagamento adiantado', () => {
    expect(pagamentoAdiantadoEmDinheiro('PAGAMENTO EM DINHEIRO NA CLÍNICA (preço PIX).')).toBe(false)
    expect(pagamentoAdiantadoEmDinheiro('Jejum de 12h. Pagamento PIX.')).toBe(false)
    expect(pagamentoAdiantadoEmDinheiro(undefined)).toBe(false)
  })
})

describe('agendar com pagamento adiantado em dinheiro', () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    fetchMock.mockReset()
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ agendamento_id: 9, valor_total: 180 }) })
    vi.stubGlobal('fetch', fetchMock)
  })

  const base = { tutor_id: 1, pet_id: 2, data_hora: '2026-11-05T09:00:00' }

  it('o resultado do agendar manda a IA escalar para a equipe conferir', async () => {
    const r = await executarTool('agendar', { ...base, observacoes: 'PAGAMENTO EM DINHEIRO NA CLÍNICA (preço PIX). Já deixou pago R$180.' }, '5524999999999') as Record<string, unknown>
    expect(r.agendamento_id).toBe(9)
    expect(r.aviso_pagamento).toBe(AVISO_PAGAMENTO_ADIANTADO)
  })

  it('agendamento normal não ganha o aviso', async () => {
    const r = await executarTool('agendar', { ...base, observacoes: 'Jejum de 12h.' }, '5524999999999') as Record<string, unknown>
    expect(r).not.toHaveProperty('aviso_pagamento')
  })
})

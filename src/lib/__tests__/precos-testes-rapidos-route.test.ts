import { describe, it, expect, vi } from 'vitest'
import { NextRequest } from 'next/server'

// A IA disse que a BioPet "não faz teste de FIV/FeLV" (30/10/2026) porque a
// tabela de preços dela só trazia o agrupador "Teste Rápido" com preço 0.

vi.mock('@/lib/agent-auth', () => ({ verifyAgentOrSystemSession: async () => true }))
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (t: string) => {
      const dados: Record<string, unknown[]> = {
        comissoes_exame: [
          { tipo_exame: 'Ultrassom Abdominal Total', preco_pix_comercial: 180, preco_cartao_comercial: 200, preco_pix_fora_horario: 240, preco_cartao_fora_horario: 260, varia_por_horario: true, duracao_minutos: 30, observacao: null },
          { tipo_exame: 'Teste Rápido', preco_pix_comercial: 0, preco_cartao_comercial: null, preco_pix_fora_horario: 0, preco_cartao_fora_horario: null, varia_por_horario: false, duracao_minutos: 15, observacao: 'configurar em Preços' },
        ],
        bioquimica_exames: [],
        testes_rapidos: [
          { nome: 'Combo FIV / FeLV', preco_pix: 160, preco_cartao: 170 },
          { nome: 'Leptospirose', preco_pix: 0, preco_cartao: 0 },
        ],
      }
      const b: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'neq', 'order']) b[m] = () => b
      b.then = (res: (v: unknown) => void) => res({ data: dados[t] ?? [], error: null })
      return b
    },
  },
}))

import { GET } from '@/app/api/agente/precos/route'

const consultar = async () => (await GET(new NextRequest('http://localhost/api/agente/precos'))).json()

describe('GET /api/agente/precos — testes rápidos', () => {
  it('traz cada teste rápido com o valor (FIV/FeLV R$160 pix / R$170 cartão)', async () => {
    const json = await consultar()
    const fiv = json.testes_rapidos.exames.find((t: { nome: string }) => t.nome.includes('FIV'))
    expect(fiv).toEqual({ nome: 'Combo FIV / FeLV', valor_definido: true, pix: 160, cartao_total: 170 })
  })

  it('teste sem valor cadastrado não vira "R$ 0": sai como valor_definido=false', async () => {
    const json = await consultar()
    const lepto = json.testes_rapidos.exames.find((t: { nome: string }) => t.nome === 'Leptospirose')
    expect(lepto).toEqual({ nome: 'Leptospirose', valor_definido: false })
  })

  it('o agrupador "Teste Rápido" (preço 0) não aparece mais na lista de exames', async () => {
    const json = await consultar()
    const tipos = json.exames.map((e: { tipo: string }) => e.tipo)
    expect(tipos).toContain('Ultrassom Abdominal Total')
    expect(tipos).not.toContain('Teste Rápido')
  })
})

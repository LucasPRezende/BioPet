import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Lucro do Dashboard (bloco de laudos): a comissão de quem fez o laudo só
// desconta do lucro se a pessoa recebe comissão (system_users.recebe_comissao).

let laudos: Record<string, unknown>[] = []
let agendamentos: Record<string, unknown>[] = []
const usuarios = [
  { id: 4, nome: 'Lucas Orgal',     recebe_comissao: true },
  { id: 2, nome: 'Andreza Moreira', recebe_comissao: false },
]

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (t: string) => {
      const b: Record<string, unknown> = {}
      for (const m of ['gte', 'lte']) b[m] = () => b
      b.select = () => (t === 'system_users' ? Promise.resolve({ data: usuarios, error: null }) : b)
      b.order = async () => ({ data: laudos, error: null })
      b.in = async () => ({ data: t === 'agendamentos' ? agendamentos : [], error: null })
      return b
    },
  },
}))
vi.mock('@/lib/system-auth', () => ({
  SESSION_COOKIE_NAME: 'sys_session',
  parseSystemSession: async () => ({ userId: 1, role: 'admin' }),
}))

import { GET } from '@/app/api/laudos/stats/route'

const laudo = (o: Record<string, unknown>) => ({
  id: 1, tipo_exame: 'Raio-X', criado_em: '2026-10-10T10:00:00', agendamento_id: 1,
  preco_exame: 230, custo_exame: 0, valor_comissao: 30, ...o,
})

async function stats() {
  const r = await GET(new NextRequest('http://localhost/api/laudos/stats?inicio=2026-10-01&fim=2026-10-31', {
    headers: { cookie: 'sys_session=x' },
  }))
  return r.json()
}

beforeEach(() => { laudos = []; agendamentos = [] })

describe('lucro dos laudos', () => {
  it('quem recebe comissão: desconta do lucro', async () => {
    laudos = [laudo({ system_user_id: 4 })]
    const s = await stats()
    expect(s).toMatchObject({ receita: 230, comissao: 30, lucro: 200 })
    expect(s.porVet[0]).toMatchObject({ nome: 'Lucas Orgal', comissao: 30, lucro: 200 })
  })

  it('quem é fixo: não desconta', async () => {
    laudos = [laudo({ system_user_id: 2 })]
    const s = await stats()
    expect(s).toMatchObject({ comissao: 0, lucro: 230 })
    expect(s.porVet[0]).toMatchObject({ comissao: 0, lucro: 230 })
  })

  it('custo também desconta', async () => {
    laudos = [laudo({ system_user_id: 4, tipo_exame: 'RX CONTRASTADO', preco_exame: 800, custo_exame: 60, valor_comissao: 90 })]
    expect(await stats()).toMatchObject({ lucro: 650 })
  })

  it('o lucro por tipo de exame usa a mesma regra do total', async () => {
    laudos = [laudo({ id: 1, system_user_id: 4 }), laudo({ id: 2, system_user_id: 2 })]
    const s = await stats()
    expect(s).toMatchObject({ comissao: 30, lucro: 430 })
    const rx = s.porTipo.find((t: { tipo_exame: string }) => t.tipo_exame === 'Raio-X')
    expect(rx).toMatchObject({ quantidade: 2, comissao: 30, lucro: 430 })
  })

  it('Hemograma (comissão da clínica) não credita quem laudou', async () => {
    // laudos de Hemograma gravam valor_comissao = comissao_laudo = 0
    laudos = [laudo({ system_user_id: 4, tipo_exame: 'Hemograma', preco_exame: 80, valor_comissao: 0 })]
    expect(await stats()).toMatchObject({ comissao: 0, lucro: 80 })
  })

  it('PCR cobrado pela clínica (repasse): receita é o líquido, sem custo de comissão', async () => {
    laudos = [laudo({ system_user_id: 2, tipo_exame: 'PCR', preco_exame: 300, valor_comissao: 0, agendamento_id: 9 })]
    agendamentos = [{ id: 9, pagamento_responsavel: 'clinica', comissao_clinica_id: null, status_pagamento: 'pago_clinica',
      forma_pagamento: 'a confirmar', agendamento_exames: [{ tipo_exame: 'PCR', comissao_clinica: 0 }],
      agendamento_bioquimica: [], agendamento_testes_rapidos: [], agendamento_pcr: [{ comissao: 120 }] }]
    const pcr = (await stats()).porTipo.find((t: { tipo_exame: string }) => t.tipo_exame === 'PCR')
    expect(pcr).toMatchObject({ receita: 180, comissao_clinica: 0, lucro: 180 })
  })

  it('BioPet recebeu direto e deve à clínica: vira comissão de clínica', async () => {
    laudos = [laudo({ system_user_id: 2, tipo_exame: 'PCR', preco_exame: 300, valor_comissao: 0, agendamento_id: 9 })]
    agendamentos = [{ id: 9, pagamento_responsavel: 'tutor', comissao_clinica_id: 3, status_pagamento: 'pago',
      forma_pagamento: 'pix', agendamento_exames: [], agendamento_bioquimica: [], agendamento_testes_rapidos: [],
      agendamento_pcr: [{ comissao: 120 }] }]
    const s = await stats()
    const pcr = s.porTipo.find((t: { tipo_exame: string }) => t.tipo_exame === 'PCR')
    expect(pcr).toMatchObject({ receita: 300, comissao_clinica: 120, lucro: 180 })
    // Totais do topo não mudam (o lucro geral já desconta pelo bloco das clínicas).
    expect(s).toMatchObject({ receita: 300, lucro: 300 })
  })
})

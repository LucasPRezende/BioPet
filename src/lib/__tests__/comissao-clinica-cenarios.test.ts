import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { clinicaQueRecebeComissao, comissaoClinicaDevida } from '@/lib/comissao-exame'

// Cenários de clínica parceira, do agendamento até o que o Dashboard mostra
// (a aba de clínicas do Dashboard lê /api/admin/relatorio/clinicas).

const tabela = [
  { tipo_exame: 'Hemograma',    comissao_clinica: 30 },
  { tipo_exame: 'Raio-X',       comissao_clinica: 0 },
  { tipo_exame: 'Teste Rápido', comissao_clinica: 0 },
]
const CLINICA = 7

describe('clínica agenda: quem recebe a comissão', () => {
  it('tutor paga a BioPet + exame com comissão → a clínica recebe', () => {
    expect(clinicaQueRecebeComissao({ tipos: ['Hemograma'], pagamentoResponsavel: 'tutor', clinicaId: CLINICA, tabela })).toBe(CLINICA)
  })

  it('a clínica cobra do tutor → nada devido (sai do repasse)', () => {
    expect(clinicaQueRecebeComissao({ tipos: ['Hemograma'], pagamentoResponsavel: 'clinica', clinicaId: CLINICA, tabela })).toBeNull()
  })

  it('exame sem comissão de clínica → não se aplica', () => {
    expect(clinicaQueRecebeComissao({ tipos: ['Raio-X'], pagamentoResponsavel: 'tutor', clinicaId: CLINICA, tabela })).toBeNull()
  })

  it('agrupador (Teste Rápido) sempre se aplica: o valor está no sub-exame', () => {
    expect(clinicaQueRecebeComissao({ tipos: ['Raio-X', 'Teste Rápido'], pagamentoResponsavel: 'tutor', clinicaId: CLINICA, tabela })).toBe(CLINICA)
  })
})

describe('quando a comissão fica devida (decisão de 16/10/2026)', () => {
  const ag = (o: Partial<{ status_pagamento: string; forma_pagamento: string }>) =>
    ({ comissao_clinica_id: CLINICA, status_pagamento: 'pago', forma_pagamento: 'pix', ...o })

  it('BioPet recebeu do tutor → devida', () => expect(comissaoClinicaDevida(ag({}))).toBe(true))
  it('cobrança em aberto → ainda não', () => {
    expect(comissaoClinicaDevida(ag({ status_pagamento: 'pendente' }))).toBe(false)
    expect(comissaoClinicaDevida(ag({ status_pagamento: 'a_receber' }))).toBe(false)
  })
  it('gratuito → nunca (mesmo com status pago)', () => {
    expect(comissaoClinicaDevida(ag({ forma_pagamento: 'gratuito' }))).toBe(false)
  })
  it('sem clínica → não', () => {
    expect(comissaoClinicaDevida({ comissao_clinica_id: null, status_pagamento: 'pago', forma_pagamento: 'pix' })).toBe(false)
  })
})

// ── Relatório de clínicas (Dashboard) ────────────────────────────────────────

let linhas: Record<string, unknown>[] = []

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => {
      const b: Record<string, unknown> = {}
      for (const m of ['select', 'or', 'neq', 'gte', 'lte']) b[m] = () => b
      b.order = async () => ({ data: linhas, error: null })
      return b
    },
  },
}))
vi.mock('@/lib/system-auth', () => ({
  SESSION_COOKIE_NAME: 'sys_session',
  parseSystemSession: async () => ({ userId: 1, role: 'admin' }),
}))

import { GET } from '@/app/api/admin/relatorio/clinicas/route'

const base = {
  comissao_clinica_confirmada: false, comissao_clinica_em: null,
  data_hora: '2026-10-20T10:00:00', repasse_confirmado: false, repasse_em: null,
  clinicas: { nome: 'Clive' }, clinica_comissao: { nome: 'Clive' },
  pets: { nome: 'Rex' }, tutores: { nome: 'Ana' },
  agendamento_testes_rapidos: [], agendamento_bioquimica: [], agendamento_exames: [],
}

async function relatorio() {
  const r = await GET(new NextRequest('http://localhost/api/admin/relatorio/clinicas?inicio=2026-10-01&fim=2026-10-31', {
    headers: { cookie: 'sys_session=x' },
  }))
  return (await r.json()).clinicas as {
    clinica_id: number; repasse_pendente: number; comissao_pendente: number; comissao_paga: number; recebido: number
    agendamentos: { id: number; comissao_valor: number; comissao_exame: string; comissao_clinica: boolean; comissao_aguardando: boolean }[]
  }[]
}

beforeEach(() => { linhas = [] })

describe('Dashboard: clínica solicitou', () => {
  it('BioPet recebeu do tutor → mostra a comissão que a BioPet deve à clínica', async () => {
    linhas = [{ ...base, id: 1, clinica_id: CLINICA, comissao_clinica_id: CLINICA, pagamento_responsavel: 'tutor',
      status_pagamento: 'pago', valor: 80, tipo_exame: 'Hemograma',
      agendamento_exames: [{ tipo_exame: 'Hemograma', comissao_clinica: 30 }] }]
    const [c] = await relatorio()
    expect(c).toMatchObject({ comissao_pendente: 30, repasse_pendente: 0 })
    expect(c.agendamentos[0]).toMatchObject({ comissao_valor: 30, comissao_exame: 'Hemograma' })
  })

  it('a clínica recebeu do tutor → mostra o repasse que a clínica deve à BioPet', async () => {
    linhas = [{ ...base, id: 2, clinica_id: CLINICA, comissao_clinica_id: null, pagamento_responsavel: 'clinica',
      status_pagamento: 'a_receber', valor: 50, tipo_exame: 'Hemograma',
      agendamento_exames: [{ tipo_exame: 'Hemograma', comissao_clinica: 30 }] }]
    const [c] = await relatorio()
    expect(c).toMatchObject({ repasse_pendente: 50, comissao_pendente: 0 })
  })

  it('não se aplica (exame sem comissão, tutor pagou a BioPet) → nada a pagar nem a receber', async () => {
    linhas = [{ ...base, id: 3, clinica_id: CLINICA, comissao_clinica_id: null, pagamento_responsavel: 'tutor',
      status_pagamento: 'pago', valor: 230, tipo_exame: 'Raio-X',
      agendamento_exames: [{ tipo_exame: 'Raio-X', comissao_clinica: 0 }] }]
    const [c] = await relatorio()
    expect(c).toMatchObject({ repasse_pendente: 0, comissao_pendente: 0 })
  })

  it('comissão já paga sai do pendente', async () => {
    linhas = [{ ...base, id: 4, clinica_id: CLINICA, comissao_clinica_id: CLINICA, pagamento_responsavel: 'tutor',
      status_pagamento: 'pago', valor: 80, tipo_exame: 'Hemograma', comissao_clinica_confirmada: true,
      agendamento_exames: [{ tipo_exame: 'Hemograma', comissao_clinica: 30 }] }]
    const [c] = await relatorio()
    expect(c.comissao_pendente).toBe(0)
  })

  it('repasse já confirmado sai do pendente', async () => {
    linhas = [{ ...base, id: 5, clinica_id: CLINICA, comissao_clinica_id: null, pagamento_responsavel: 'clinica',
      status_pagamento: 'a_receber', valor: 50, tipo_exame: 'Hemograma', repasse_confirmado: true,
      agendamento_exames: [{ tipo_exame: 'Hemograma', comissao_clinica: 30 }] }]
    const [c] = await relatorio()
    expect(c.repasse_pendente).toBe(0)
  })

  it('soma Teste Rápido + Hemograma no mesmo agendamento', async () => {
    linhas = [{ ...base, id: 6, clinica_id: CLINICA, comissao_clinica_id: CLINICA, pagamento_responsavel: 'tutor',
      status_pagamento: 'pago', valor: 210, tipo_exame: 'Hemograma, Teste Rápido',
      agendamento_testes_rapidos: [{ comissao: 25, testes_rapidos: { nome: '4Dx' } }],
      agendamento_exames: [{ tipo_exame: 'Hemograma', comissao_clinica: 30 }, { tipo_exame: 'Teste Rápido', comissao_clinica: 0 }] }]
    const [c] = await relatorio()
    expect(c.comissao_pendente).toBe(55)
    expect(c.agendamentos[0].comissao_exame).toBe('4Dx, Hemograma')
  })

  it('tutor ainda não pagou (ou faltou) → não entra no "a pagar", fica aguardando', async () => {
    linhas = [{ ...base, id: 7, clinica_id: CLINICA, comissao_clinica_id: CLINICA, pagamento_responsavel: 'tutor',
      status_pagamento: 'pendente', valor: 80, tipo_exame: 'Hemograma',
      agendamento_exames: [{ tipo_exame: 'Hemograma', comissao_clinica: 30 }] }]
    const [c] = await relatorio()
    expect(c.comissao_pendente).toBe(0)
    expect(c.agendamentos[0]).toMatchObject({ comissao_clinica: false, comissao_aguardando: true })
  })

  it('gratuito → nenhuma comissão, mesmo com sub-exame gravado com comissão (dado antigo)', async () => {
    linhas = [{ ...base, id: 8, clinica_id: null, comissao_clinica_id: CLINICA, pagamento_responsavel: 'tutor',
      status_pagamento: 'pago', forma_pagamento: 'gratuito', valor: null, tipo_exame: 'Teste Rápido',
      agendamento_testes_rapidos: [{ comissao: 50, testes_rapidos: { nome: 'Combo FIV / FeLV' } }] }]
    const [c] = await relatorio()
    expect(c).toMatchObject({ comissao_pendente: 0, comissao_paga: 0 })
    expect(c.agendamentos[0]).toMatchObject({ comissao_clinica: false, comissao_aguardando: false })
  })
})

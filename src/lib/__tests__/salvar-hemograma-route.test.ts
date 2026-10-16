import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Banco, sessão, PDF e storage simulados: testa que o laudo sai com o nome do
// exame como está cadastrado (ex.: "HEMOGRAMA"), não com um nome fixo — senão
// a agenda continua pedindo o laudo e a comissão não é encontrada.
const inserts: Record<string, unknown>[] = []
let agendamentoExames: { tipo_exame: string }[] = []
let comissoes: { tipo_exame: string; preco_pix_comercial: number; custo_exame: number; comissao_laudo: number; comissao_clinica: number }[] = []
const filtrosEq: Record<string, unknown>[] = []

function builder(tabela: string) {
  const filtros: { ilike?: string; eq: Record<string, unknown> } = { eq: {} }
  const linhas = () => {
    const base = tabela === 'agendamento_exames' ? agendamentoExames
               : tabela === 'comissoes_exame'    ? comissoes
               : []
    return (base as Record<string, unknown>[]).filter(r =>
      (!filtros.ilike || String(r.tipo_exame).toLowerCase() === filtros.ilike.toLowerCase()) &&
      (filtros.eq.tipo_exame === undefined || r.tipo_exame === filtros.eq.tipo_exame))
  }
  const b: Record<string, unknown> = {}
  b.select = () => b
  b.eq = (col: string, v: unknown) => { filtros.eq[col] = v; filtrosEq.push({ tabela, col, v }); return b }
  b.ilike = (_col: string, v: string) => { filtros.ilike = v; return b }
  b.limit = async () => ({ data: linhas(), error: null })
  b.maybeSingle = async () => ({ data: linhas()[0] ?? null, error: null })
  b.insert = (row: Record<string, unknown>) => { inserts.push(row); return b }
  b.single = async () => ({ data: { id: 1, ...inserts[inserts.length - 1] }, error: null })
  b.update = () => ({ eq: async () => ({ error: null }) })
  // laudos / agendamento_exames contados no fim (Promise.all de select+eq)
  b.then = (res: (v: unknown) => void) => res({ data: [], error: null })
  return b
}

vi.mock('@/lib/supabase', () => ({ supabase: { from: (t: string) => builder(t) } }))
vi.mock('@/lib/system-auth', () => ({
  SESSION_COOKIE_NAME: 'sys_session',
  parseSystemSession: async () => ({ userId: 5, role: 'admin' }),
}))
vi.mock('@/lib/generate-hemograma-pdf', () => ({
  gerarLaudoHemograma: async () => ({ pdf: Buffer.from('pdf'), referencias: [] }),
}))
vi.mock('@/lib/pdf-storage', () => ({ savePdf: async () => {}, deletePdf: async () => {} }))
vi.mock('@/lib/laudo-duplicado', () => ({ jaTemLaudo: async () => false }))

import { POST } from '@/app/api/laudos/salvar-hemograma/route'

const laudo = {
  nome_pet: 'Maya', especie: 'Canina', raca: '', sexo: 'Fêmea', idade: '2 anos', peso: '',
  tutor: 'Natalia', telefone: '', medico: '', crmv: '', clinica: '', material: 'Sangue total (EDTA)',
  data_laudo: '2026-10-16', faixa_etaria: 'todos', observacoes: '', valores: { LEU: '10.16' },
}
const req = (agendamento_id: number | null) =>
  new NextRequest('http://localhost/api/laudos/salvar-hemograma', {
    method: 'POST',
    headers: { cookie: 'sys_session=x', 'content-type': 'application/json' },
    body: JSON.stringify({ laudo, veterinario_id: null, tutor_id: null, pet_id: null, agendamento_id }),
  })

beforeEach(() => {
  inserts.length = 0
  filtrosEq.length = 0
  agendamentoExames = []
  // Hemograma: a comissão é da clínica, quem faz o laudo não recebe nada.
  comissoes = [{ tipo_exame: 'HEMOGRAMA', preco_pix_comercial: 50, custo_exame: 0, comissao_laudo: 0, comissao_clinica: 30 }]
})

describe('POST salvar-hemograma', () => {
  it('usa o nome do exame do agendamento ("HEMOGRAMA") e acha a comissão', async () => {
    agendamentoExames = [{ tipo_exame: 'HEMOGRAMA' }]
    const r = await POST(req(767))
    expect(r.status).toBe(201)
    expect(inserts[0]).toMatchObject({
      tipo_exame: 'HEMOGRAMA', preco_exame: 50, custo_exame: 0, valor_comissao: 0, agendamento_id: 767,
    })
  })

  it('sem agendamento, usa o nome cadastrado em Preços', async () => {
    const r = await POST(req(null))
    expect(r.status).toBe(201)
    expect(inserts[0]).toMatchObject({ tipo_exame: 'HEMOGRAMA', valor_comissao: 0 })
  })

  it('laudo grava só a comissão de quem laudou (comissao_laudo)', async () => {
    comissoes = [{ tipo_exame: 'HEMOGRAMA', preco_pix_comercial: 50, custo_exame: 0, comissao_laudo: 12, comissao_clinica: 30 }]
    const r = await POST(req(null))
    expect(r.status).toBe(201)
    expect(inserts[0]).toMatchObject({ valor_comissao: 12 })
  })

  it('sem exame cadastrado, cai no nome padrão "Hemograma"', async () => {
    comissoes = []
    const r = await POST(req(null))
    expect(r.status).toBe(201)
    expect(inserts[0]).toMatchObject({ tipo_exame: 'Hemograma', preco_exame: null })
  })
})

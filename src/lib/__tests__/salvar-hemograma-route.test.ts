import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Banco, sessão, PDF e storage simulados: testa que o laudo sai com o nome do
// exame como está cadastrado (ex.: "HEMOGRAMA"), não com um nome fixo — senão
// a agenda continua pedindo o laudo e a comissão não é encontrada.
const inserts: Record<string, unknown>[] = []
let agendamentoExames: { tipo_exame: string }[] = []
let comissoes: { tipo_exame: string; preco_pix_comercial: number; custo_exame: number; comissao_laudo: number; comissao_clinica: number }[] = []

function builder(tabela: string) {
  const filtros: Record<string, unknown> = {}
  const linhas = () => {
    const base = tabela === 'agendamento_exames' ? agendamentoExames
               : tabela === 'comissoes_exame'    ? comissoes
               : []
    return (base as Record<string, unknown>[]).filter(r =>
      filtros.tipo_exame === undefined || r.tipo_exame === filtros.tipo_exame)
  }
  const b: Record<string, unknown> = {}
  b.select = () => b
  b.eq = (col: string, v: unknown) => { if (col === 'tipo_exame') filtros.tipo_exame = v; return b }
  b.maybeSingle = async () => ({ data: linhas()[0] ?? null, error: null })
  b.insert = (row: Record<string, unknown>) => { inserts.push(row); return b }
  b.single = async () => ({ data: { id: 1, ...inserts[inserts.length - 1] }, error: null })
  b.update = () => ({ eq: async () => ({ error: null }) })
  b.then = (res: (v: unknown) => void) => res({ data: linhas(), error: null })
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
const req = (agendamento_id: number | null, exame?: string) =>
  new NextRequest('http://localhost/api/laudos/salvar-hemograma', {
    method: 'POST',
    headers: { cookie: 'sys_session=x', 'content-type': 'application/json' },
    body: JSON.stringify({ laudo, veterinario_id: null, tutor_id: null, pet_id: null, agendamento_id, exame }),
  })

beforeEach(() => {
  inserts.length = 0
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

  it('exame Reticulócitos: laudo sai como o exame do agendamento, não Hemograma', async () => {
    agendamentoExames = [{ tipo_exame: 'Hemograma' }, { tipo_exame: 'Reticulócitos' }]
    comissoes.push({ tipo_exame: 'Reticulócitos', preco_pix_comercial: 25, custo_exame: 0, comissao_laudo: 3, comissao_clinica: 7 })
    const r = await POST(req(800, 'reticulocitos'))
    expect(r.status).toBe(201)
    expect(inserts[0]).toMatchObject({ tipo_exame: 'Reticulócitos', preco_exame: 25, valor_comissao: 3, agendamento_id: 800 })
  })

  it('Reticulócitos sem agendamento usa o nome de Preços, ignorando caixa e acento', async () => {
    comissoes.push({ tipo_exame: 'RETICULÓCITOS', preco_pix_comercial: 25, custo_exame: 0, comissao_laudo: 0, comissao_clinica: 7 })
    const r = await POST(req(null, 'reticulocitos'))
    expect(r.status).toBe(201)
    expect(inserts[0]).toMatchObject({ tipo_exame: 'RETICULÓCITOS', preco_exame: 25 })
  })

  it('sem informar o exame, continua sendo Hemograma', async () => {
    agendamentoExames = [{ tipo_exame: 'Reticulócitos' }, { tipo_exame: 'HEMOGRAMA' }]
    const r = await POST(req(801))
    expect(r.status).toBe(201)
    expect(inserts[0]).toMatchObject({ tipo_exame: 'HEMOGRAMA' })
  })
})

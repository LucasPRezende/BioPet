import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Banco, sessão, PDF, storage e estoque simulados: testa que o laudo sai com o
// nome do exame do agendamento/Preços pelo tipo de fita, grava a comissão de
// quem laudou, dá baixa de 1 fita e não quebra a emissão se o estoque falhar.
const inserts: Record<string, unknown>[] = []
let agendamentoExames: { tipo_exame: string }[] = []
let comissoes: { tipo_exame: string; preco_pix_comercial: number; comissao_laudo: number }[] = []
const baixas: { laudoId: number; consumo: Map<number, number> }[] = []
let estoqueFalha = false
let duplicado = false

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
  b.single = async () => ({ data: { id: 42, ...inserts[inserts.length - 1] }, error: null })
  b.update = () => ({ eq: async () => ({ error: null }) })
  b.then = (res: (v: unknown) => void) => res({ data: linhas(), error: null })
  return b
}

vi.mock('@/lib/supabase', () => ({ supabase: { from: (t: string) => builder(t) } }))
vi.mock('@/lib/system-auth', () => ({
  SESSION_COOKIE_NAME: 'sys_session',
  parseSystemSession: async () => ({ userId: 5, role: 'admin' }),
}))
vi.mock('@/lib/generate-urinalise-pdf', () => ({
  gerarLaudoUrinalise: async () => ({ pdf: Buffer.from('pdf'), referencias: [] }),
}))
vi.mock('@/lib/pdf-storage', () => ({ savePdf: async () => {}, deletePdf: async () => {} }))
vi.mock('@/lib/laudo-duplicado', () => ({ jaTemLaudo: async () => duplicado }))
vi.mock('@/lib/estoque', () => ({
  consumoExame: async (tipo: string) => new Map([[tipo.includes('14') ? 14 : 11, 1]]),
  baixarConsumoLaudo: async (laudoId: number, consumo: Map<number, number>) => {
    if (estoqueFalha) throw new Error('sem lote')
    baixas.push({ laudoId, consumo })
    return 1.8
  },
}))

import { POST } from '@/app/api/laudos/salvar-urinalise/route'

const base = {
  nome_pet: 'Thor', especie: 'Canina', raca: '', sexo: 'Macho', idade: '5 anos', peso: '',
  tutor: 'Ana', telefone: '', medico: '', crmv: '', clinica: '', material: 'Urina', data_laudo: '2026-10-27',
  titulo: '', fita: 11, valores: { LEU: '0', PRO: '100', SG: '1.025' },
  fisico: { cor: 'Amarelo citrino' }, sedimento: {}, observacoes: '',
}
const req = (agendamento_id: number | null, laudo: Record<string, unknown> = base) =>
  new NextRequest('http://localhost/api/laudos/salvar-urinalise', {
    method: 'POST',
    headers: { cookie: 'sys_session=x', 'content-type': 'application/json' },
    body: JSON.stringify({ laudo, veterinario_id: null, tutor_id: null, pet_id: null, agendamento_id }),
  })

beforeEach(() => {
  inserts.length = 0
  baixas.length = 0
  estoqueFalha = false
  duplicado = false
  agendamentoExames = []
  comissoes = [
    { tipo_exame: 'Urinálise (11 parâmetros)', preco_pix_comercial: 60, comissao_laudo: 8 },
    { tipo_exame: 'Urinálise (14 parâmetros)', preco_pix_comercial: 80, comissao_laudo: 10 },
  ]
})

describe('POST salvar-urinalise', () => {
  it('usa o exame do agendamento com o mesmo tipo de fita e grava preço e comissão de quem laudou', async () => {
    agendamentoExames = [{ tipo_exame: 'Hemograma' }, { tipo_exame: 'Urinálise (14 parâmetros)' }]
    const r = await POST(req(900, { ...base, fita: 14, valores: { LEU: '0', MA: '<=1' } }))
    expect(r.status).toBe(201)
    expect(inserts[0]).toMatchObject({ tipo_exame: 'Urinálise (14 parâmetros)', preco_exame: 80, valor_comissao: 10, agendamento_id: 900 })
  })

  it('sem agendamento, usa o nome cadastrado em Preços para a fita', async () => {
    const r = await POST(req(null))
    expect(r.status).toBe(201)
    expect(inserts[0]).toMatchObject({ tipo_exame: 'Urinálise (11 parâmetros)', preco_exame: 60, valor_comissao: 8 })
  })

  it('dá baixa de 1 fita do tipo do exame e grava o custo', async () => {
    const r = await POST(req(null))
    expect(r.status).toBe(201)
    expect(baixas).toHaveLength(1)
    expect(baixas[0].laudoId).toBe(42)
    expect(Array.from(baixas[0].consumo)).toEqual([[11, 1]])
    expect((await r.json()).custo_exame).toBe(1.8)
  })

  it('falha no estoque não impede a emissão', async () => {
    estoqueFalha = true
    const r = await POST(req(null))
    expect(r.status).toBe(201)
    expect(inserts).toHaveLength(1)
  })

  it('recusa fita 11 com parâmetros que só a 14 tem (não salva nada)', async () => {
    const r = await POST(req(null, { ...base, valores: { LEU: '0', CR: '200' } }))
    expect(r.status).toBe(400)
    expect(inserts).toHaveLength(0)
  })

  it('bloqueia segundo laudo do mesmo exame no agendamento', async () => {
    agendamentoExames = [{ tipo_exame: 'Urinálise (11 parâmetros)' }]
    duplicado = true
    const r = await POST(req(901))
    expect(r.status).toBe(409)
    expect(inserts).toHaveLength(0)
  })

  it('snapshot do laudo guarda fita, química, físico e sedimento', async () => {
    await POST(req(null))
    expect(JSON.parse(String(inserts[0].texto))).toMatchObject({
      fita: 11, valores: { PRO: '100' }, fisico: { cor: 'Amarelo citrino' }, sedimento: {},
    })
  })
})

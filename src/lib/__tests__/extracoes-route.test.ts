import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Extrações valem para qualquer exame com comissao_extracao > 0 na tabela de
// Preços, não só Hemogasometria.

let tabela: { tipo_exame: string; comissao_laudo: number; comissao_clinica: number; comissao_extracao: number }[] = []
let linhasExames: { agendamento_id: number; tipo_exame: string }[] = []
let agendamentos: { id: number; tipo_exame: string; vet_extracao_id: number | null; comissao_extracao: number | null; data_hora: string }[] = []
const updates: { id: unknown; dados: unknown }[] = []
const filtrosIn: { tabela: string; col: string; vals: unknown[] }[] = []

vi.mock('@/lib/comissao-exame-db', () => ({ carregarComissoes: async () => tabela }))
vi.mock('@/lib/system-auth', () => ({
  SESSION_COOKIE_NAME: 'sys_session',
  parseSystemSession: async () => ({ userId: 1, role: 'admin' }),
}))
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (t: string) => {
      const f: { eq: Record<string, unknown>; in?: { col: string; vals: unknown[] }; ilike?: string } = { eq: {} }
      const dados = () => {
        if (t === 'agendamento_exames') {
          return linhasExames.filter(l =>
            (f.eq.agendamento_id === undefined || l.agendamento_id === f.eq.agendamento_id) &&
            (!f.in || (f.in.vals as string[]).includes(l.tipo_exame)))
        }
        if (t === 'agendamentos') {
          return agendamentos.filter(a =>
            (f.eq.id === undefined || a.id === f.eq.id) &&
            (!f.ilike || /hemogasometria/i.test(a.tipo_exame)) &&
            (!f.in || (f.in.vals as number[]).includes(a.id)))
        }
        if (t === 'veterinarios') return [{ id: 3, nome: 'Vet Teste' }]
        return []
      }
      const b: Record<string, unknown> = {}
      for (const m of ['select', 'order', 'gte', 'lt', 'not', 'is']) b[m] = () => b
      b.eq     = (c: string, v: unknown) => { f.eq[c] = v; return b }
      b.in     = (c: string, v: unknown[]) => { f.in = { col: c, vals: v }; filtrosIn.push({ tabela: t, col: c, vals: v }); return b }
      b.ilike  = (_c: string, v: string) => { f.ilike = v; return b }
      b.single = async () => ({ data: dados()[0] ?? null, error: null })
      b.maybeSingle = async () => ({ data: dados()[0] ?? null, error: null })
      b.update = (d: unknown) => ({ eq: async (_c: string, id: unknown) => { updates.push({ id, dados: d }); return { error: null } } })
      b.then = (res: (v: unknown) => void) => res({ data: dados(), error: null })
      return b
    },
  },
}))

import { PATCH } from '@/app/api/admin/extracoes/[id]/route'
import { GET } from '@/app/api/admin/extracoes/route'

const patch = (id: number, body: unknown) => PATCH(
  new NextRequest(`http://localhost/api/admin/extracoes/${id}`, {
    method: 'PATCH', headers: { cookie: 'sys_session=x', 'content-type': 'application/json' }, body: JSON.stringify(body),
  }),
  { params: Promise.resolve({ id: String(id) }) },
)

beforeEach(() => {
  tabela = [
    { tipo_exame: 'Hemogasometria',  comissao_laudo: 0,  comissao_clinica: 0,  comissao_extracao: 15 },
    { tipo_exame: 'Perfil Completo', comissao_laudo: 0,  comissao_clinica: 20, comissao_extracao: 10 },
    { tipo_exame: 'Raio-X',          comissao_laudo: 30, comissao_clinica: 0,  comissao_extracao: 0 },
  ]
  linhasExames = [
    { agendamento_id: 1, tipo_exame: 'Hemogasometria' },
    { agendamento_id: 2, tipo_exame: 'Perfil Completo' },
    { agendamento_id: 3, tipo_exame: 'Raio-X' },
    { agendamento_id: 4, tipo_exame: 'Hemogasometria' },
    { agendamento_id: 4, tipo_exame: 'Perfil Completo' },
  ]
  agendamentos = [
    { id: 1, tipo_exame: 'Hemogasometria',                  vet_extracao_id: null, comissao_extracao: null, data_hora: '2026-10-10T10:00:00' },
    { id: 2, tipo_exame: 'Perfil Completo',                 vet_extracao_id: null, comissao_extracao: null, data_hora: '2026-10-10T11:00:00' },
    { id: 3, tipo_exame: 'Raio-X',                          vet_extracao_id: null, comissao_extracao: null, data_hora: '2026-10-10T12:00:00' },
    { id: 4, tipo_exame: 'Hemogasometria, Perfil Completo', vet_extracao_id: null, comissao_extracao: null, data_hora: '2026-10-10T13:00:00' },
    { id: 5, tipo_exame: 'Hemogasometria (legado)',         vet_extracao_id: null, comissao_extracao: null, data_hora: '2026-01-10T13:00:00' },
  ]
  updates.length = 0
  filtrosIn.length = 0
})

describe('atribuir vet da extração', () => {
  it('Hemogasometria continua valendo (R$ 15)', async () => {
    const r = await patch(1, { vet_extracao_id: 3 })
    expect(r.status).toBe(200)
    expect(updates[0]).toMatchObject({ id: 1, dados: { vet_extracao_id: 3, comissao_extracao: 15 } })
  })

  it('outro exame com comissão de extração também vale', async () => {
    const r = await patch(2, { vet_extracao_id: 3 })
    expect(r.status).toBe(200)
    expect(updates[0]).toMatchObject({ dados: { comissao_extracao: 10 } })
  })

  it('soma os exames do agendamento', async () => {
    await patch(4, { vet_extracao_id: 3 })
    expect(updates[0]).toMatchObject({ dados: { comissao_extracao: 25 } })
  })

  it('exame sem extração é recusado', async () => {
    const r = await patch(3, { vet_extracao_id: 3 })
    expect(r.status).toBe(403)
    expect(updates).toHaveLength(0)
  })

  it('legado sem agendamento_exames: hemogasometria pelo nome', async () => {
    const r = await patch(5, { vet_extracao_id: 3 })
    expect(r.status).toBe(200)
    expect(updates[0]).toMatchObject({ dados: { comissao_extracao: 15 } })
  })
})

describe('lista de extrações', () => {
  it('busca pelos exames que pagam extração, vindos da tabela de Preços', async () => {
    const r = await GET(new NextRequest('http://localhost/api/admin/extracoes?mes=2026-10&tab=sem_vet', { headers: { cookie: 'sys_session=x' } }))
    expect(r.status).toBe(200)
    const porExame = filtrosIn.find(f => f.tabela === 'agendamento_exames')
    expect(porExame?.vals).toEqual(['Hemogasometria', 'Perfil Completo'])
    const ids = (await r.json()).extracoes.map((e: { id: number }) => e.id).sort()
    expect(ids).toEqual([1, 2, 4, 5])
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Banco e sessão simulados: testa a lógica das rotas (validação, adiantamento,
// estorno, permissão), não o Supabase.
const inserts: Record<string, unknown>[] = []
const updates: Record<string, unknown>[] = []
let tabelas: Record<string, unknown> = {}
let saldoAtual = 0
let sessao: { userId: number; role: string } | null = { userId: 5, role: 'admin' }
let updateRetorna: { id: number }[] = [{ id: 1 }]

function builder(tabela: string) {
  const b: Record<string, unknown> = {}
  const chain = () => b
  for (const m of ['select', 'eq', 'is', 'in', 'gte', 'lte', 'order', 'limit', 'gt']) b[m] = chain
  b.maybeSingle = async () => ({ data: tabelas[tabela] ?? null, error: null })
  b.single = async () => ({ data: { id: 99 }, error: null })
  b.insert = (row: Record<string, unknown>) => { inserts.push(row); return b }
  b.update = (row: Record<string, unknown>) => { updates.push(row); return {
    eq: () => ({ is: () => ({ select: async () => ({ data: updateRetorna, error: null }) }) }),
  } }
  return b
}

vi.mock('@/lib/supabase', () => ({ supabase: { from: (t: string) => builder(t) } }))
vi.mock('@/lib/system-auth', () => ({
  SESSION_COOKIE_NAME: 'sys_session',
  parseSystemSession: async () => sessao,
}))
vi.mock('@/lib/comissao-saldo', async () => {
  const real = await vi.importActual<typeof import('@/lib/comissao-saldo')>('@/lib/comissao-saldo')
  return {
    ...real,
    carregarPosicao: async () => ({ saldo: saldoAtual }),
    carregarPosicoes: async () => [],
  }
})

import { POST } from '@/app/api/admin/pagamentos-comissao/route'
import { POST as ESTORNAR } from '@/app/api/admin/pagamentos-comissao/[id]/estornar/route'

const req = (body: unknown) =>
  new NextRequest('http://localhost/api/admin/pagamentos-comissao', {
    method: 'POST',
    headers: { cookie: 'sys_session=x', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

beforeEach(() => {
  inserts.length = 0; updates.length = 0
  tabelas = { system_users: { id: 4 }, veterinarios: { id: 1, system_user_id: null } }
  saldoAtual = 100
  sessao = { userId: 5, role: 'admin' }
  updateRetorna = [{ id: 1 }]
})

describe('POST pagamentos-comissao', () => {
  it('nega quem não é admin', async () => {
    sessao = { userId: 9, role: 'user' }
    const r = await POST(req({ pessoa_tipo: 'usuario', pessoa_id: 4, valor: 10 }))
    expect(r.status).toBe(403)
    expect(inserts).toHaveLength(0)
  })

  it('registra pagamento parcial (valor livre dentro do saldo)', async () => {
    const r = await POST(req({ pessoa_tipo: 'usuario', pessoa_id: 4, valor: '37,50', forma: 'pix' }))
    expect(r.status).toBe(201)
    expect(inserts).toHaveLength(1)
    expect(inserts[0]).toMatchObject({ pessoa_tipo: 'usuario', pessoa_id: 4, valor: 37.5, forma: 'pix', criado_por: 5 })
    expect((await r.json()).adiantamento).toBe(false)
  })

  it('pagamento acima do saldo pede confirmação e NÃO grava', async () => {
    const r = await POST(req({ pessoa_tipo: 'usuario', pessoa_id: 4, valor: 130 }))
    expect(r.status).toBe(409)
    const j = await r.json()
    expect(j.requer_confirmacao).toBe('adiantamento')
    expect(j.excedente).toBe(30)
    expect(inserts).toHaveLength(0)
  })

  it('com confirmação grava e marca como adiantamento', async () => {
    const r = await POST(req({ pessoa_tipo: 'usuario', pessoa_id: 4, valor: 130, confirmar_adiantamento: true }))
    expect(r.status).toBe(201)
    expect(inserts).toHaveLength(1)
    const j = await r.json()
    expect(j.adiantamento).toBe(true)
    expect(j.excedente).toBe(30)
  })

  it('pessoa sem saldo: qualquer valor é adiantamento e pede confirmação', async () => {
    saldoAtual = 0
    const r = await POST(req({ pessoa_tipo: 'usuario', pessoa_id: 4, valor: 20 }))
    expect(r.status).toBe(409)
    expect(inserts).toHaveLength(0)
  })

  it.each([0, -1, 'abc', null])('rejeita valor inválido (%s)', async v => {
    const r = await POST(req({ pessoa_tipo: 'usuario', pessoa_id: 4, valor: v }))
    expect(r.status).toBe(400)
    expect(inserts).toHaveLength(0)
  })

  it('rejeita data futura', async () => {
    const r = await POST(req({ pessoa_tipo: 'usuario', pessoa_id: 4, valor: 10, pago_em: '2999-01-01' }))
    expect(r.status).toBe(400)
  })

  it('rejeita pessoa_tipo inválido', async () => {
    const r = await POST(req({ pessoa_tipo: 'clinica', pessoa_id: 4, valor: 10 }))
    expect(r.status).toBe(400)
  })

  it('pessoa inexistente → 404', async () => {
    tabelas = { system_users: null }
    const r = await POST(req({ pessoa_tipo: 'usuario', pessoa_id: 404, valor: 10 }))
    expect(r.status).toBe(404)
  })

  it('vet com usuário vinculado não recebe pagamento direto (saldo é do usuário)', async () => {
    tabelas = { veterinarios: { id: 1, system_user_id: 4 } }
    const r = await POST(req({ pessoa_tipo: 'veterinario', pessoa_id: 1, valor: 10 }))
    expect(r.status).toBe(400)
    expect(inserts).toHaveLength(0)
  })

  it('vet sem usuário aceita pagamento', async () => {
    const r = await POST(req({ pessoa_tipo: 'veterinario', pessoa_id: 1, valor: 15 }))
    expect(r.status).toBe(201)
    expect(inserts[0]).toMatchObject({ pessoa_tipo: 'veterinario', pessoa_id: 1, valor: 15 })
  })
})

describe('POST estornar', () => {
  const estornar = (body: unknown) =>
    ESTORNAR(
      new NextRequest('http://localhost/x', {
        method: 'POST', headers: { cookie: 'sys_session=x', 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ id: '1' }) },
    )

  it('exige motivo', async () => {
    expect((await estornar({ motivo: '  ' })).status).toBe(400)
    expect(updates).toHaveLength(0)
  })

  it('estorna e guarda quem/quando/motivo (não apaga)', async () => {
    const r = await estornar({ motivo: 'valor errado' })
    expect(r.status).toBe(200)
    expect(updates[0]).toMatchObject({ estornado_por: 5, estornado_motivo: 'valor errado' })
    expect(updates[0].estornado_em).toBeTruthy()
  })

  it('já estornado / inexistente → 404', async () => {
    updateRetorna = []
    expect((await estornar({ motivo: 'x' })).status).toBe(404)
  })

  it('nega quem não é admin', async () => {
    sessao = { userId: 9, role: 'user' }
    expect((await estornar({ motivo: 'x' })).status).toBe(403)
  })
})

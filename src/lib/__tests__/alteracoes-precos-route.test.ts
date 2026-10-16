import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Banco e sessão simulados: testa a validação do lote antes da função SQL e a
// tradução dos erros dela (conflito → 409).
let exames: { id: number; tipo_exame: string; ativo: boolean; preco_pix_comercial: number | null }[] = []
let rpcErro: { message: string } | null = null
const rpcChamadas: unknown[] = []
let role = 'admin'

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => {
      const b: Record<string, unknown> = {}
      b.select = () => b
      b.in = async (_c: string, ids: number[]) => ({ data: exames.filter(e => ids.includes(e.id)), error: null })
      return b
    },
    rpc: async (_nome: string, args: unknown) => {
      rpcChamadas.push(args)
      return rpcErro ? { data: null, error: rpcErro } : { data: 'lote-1', error: null }
    },
  },
}))
vi.mock('@/lib/system-auth', () => ({
  SESSION_COOKIE_NAME: 'sys_session',
  parseSystemSession: async () => ({ userId: 5, role }),
}))

import { POST } from '@/app/api/comissoes/alteracoes/route'

const req = (alteracoes: unknown) => new NextRequest('http://localhost/api/comissoes/alteracoes', {
  method: 'POST',
  headers: { cookie: 'sys_session=x', 'content-type': 'application/json' },
  body: JSON.stringify({ alteracoes }),
})

beforeEach(() => {
  exames = [
    { id: 1, tipo_exame: 'Hemograma', ativo: true,  preco_pix_comercial: 80 },
    { id: 2, tipo_exame: 'Tomografia', ativo: false, preco_pix_comercial: null },
  ]
  rpcErro = null
  rpcChamadas.length = 0
  role = 'admin'
})

describe('POST /api/comissoes/alteracoes', () => {
  it('aplica o lote e manda o usuário para o histórico', async () => {
    const r = await POST(req([{ tabela: 'comissoes_exame', id: 1, campo: 'comissao_clinica', antes: 0, depois: 30 }]))
    expect(r.status).toBe(200)
    expect(await r.json()).toMatchObject({ lote_id: 'lote-1', total: 1 })
    expect(rpcChamadas[0]).toMatchObject({ p_usuario: 5 })
  })

  it('só admin', async () => {
    role = 'user'
    const r = await POST(req([{ tabela: 'comissoes_exame', id: 1, campo: 'ativo', antes: true, depois: false }]))
    expect(r.status).toBe(403)
  })

  it('bloqueia ativar exame sem Pix comercial', async () => {
    const r = await POST(req([{ tabela: 'comissoes_exame', id: 2, campo: 'ativo', antes: false, depois: true }]))
    expect(r.status).toBe(400)
    expect((await r.json()).error).toContain('Tomografia: exame ativo precisa do Pix comercial')
    expect(rpcChamadas).toHaveLength(0)
  })

  it('libera ativar quando o mesmo lote define o Pix', async () => {
    const r = await POST(req([
      { tabela: 'comissoes_exame', id: 2, campo: 'preco_pix_comercial', antes: null, depois: 300 },
      { tabela: 'comissoes_exame', id: 2, campo: 'ativo', antes: false, depois: true },
    ]))
    expect(r.status).toBe(200)
  })

  it('bloqueia apagar o Pix de exame ativo', async () => {
    const r = await POST(req([{ tabela: 'comissoes_exame', id: 1, campo: 'preco_pix_comercial', antes: 80, depois: null }]))
    expect(r.status).toBe(400)
  })

  it('valor "antes" diferente do banco vira 409', async () => {
    rpcErro = { message: 'conflito: comissoes_exame.1 comissao_clinica' }
    const r = await POST(req([{ tabela: 'comissoes_exame', id: 1, campo: 'comissao_clinica', antes: 0, depois: 30 }]))
    expect(r.status).toBe(409)
  })

  it('recusa tabela fora da lista e valor negativo', async () => {
    expect((await POST(req([{ tabela: 'laudos', id: 1, campo: 'valor_comissao', antes: 0, depois: 1 }]))).status).toBe(400)
    expect((await POST(req([{ tabela: 'testes_rapidos', id: 1, campo: 'preco_pix', antes: 0, depois: -1 }]))).status).toBe(400)
    expect((await POST(req([]))).status).toBe(400)
  })
})

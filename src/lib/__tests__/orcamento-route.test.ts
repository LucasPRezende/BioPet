import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Orçamento: teste rápido e PCR entram como a bioquímica (preço fixo da tabela).
// Item sem valor cadastrado (preço 0) não pode virar "R$ 0" no documento.

const gerarPdf = vi.fn(async (_: unknown) => Buffer.from('%PDF'))
vi.mock('@/lib/generate-orcamento-pdf', () => ({ generateOrcamentoPDF: (d: unknown) => gerarPdf(d) }))
vi.mock('@/lib/system-auth', () => ({
  SESSION_COOKIE_NAME: 'sess',
  parseSystemSession: async (c: string) => (c === 'ok' ? { role: 'atendente' } : null),
}))

const dados: Record<string, Record<string, unknown>[]> = {
  comissoes_exame: [
    { tipo_exame: 'Ultrassom', varia_por_horario: true, preco_pix_comercial: 250, preco_cartao_comercial: 275, preco_pix_fora_horario: 350, preco_cartao_fora_horario: 385 },
  ],
  bioquimica_exames: [{ nome: 'Glicose', preco_pix: 20, preco_cartao: 22 }],
  testes_rapidos: [
    { nome: 'Combo FIV / FeLV', preco_pix: 160, preco_cartao: 170 },
    { nome: 'Leptospirose', preco_pix: 0, preco_cartao: 0 },
  ],
  exames_pcr: [{ nome: 'PCR Cinomose', preco_pix: 300, preco_cartao: 330 }],
}
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (t: string) => {
      let linhas = dados[t] ?? []
      const b: Record<string, unknown> = {}
      b.select = () => b
      b.order = () => b
      b.eq = () => b
      b.in = (col: string, vals: string[]) => { linhas = linhas.filter(l => vals.includes(String(l[col] ?? l.nome))); return b }
      b.then = (res: (v: unknown) => void) => res({ data: linhas, error: null })
      return b
    },
  },
}))

import { GET, POST } from '@/app/api/orcamento/route'

const req = (body: unknown, cookie = 'ok') =>
  new NextRequest('http://localhost/api/orcamento', {
    method: 'POST', body: JSON.stringify(body),
    headers: { cookie: `sess=${cookie}`, 'content-type': 'application/json' },
  })

beforeEach(() => gerarPdf.mockClear())

describe('POST /api/orcamento — teste rápido e PCR', () => {
  it('soma teste rápido e PCR pelo preço da tabela, com o rótulo do grupo', async () => {
    const res = await POST(req({ paciente: 'Thor', testes_rapidos: ['Combo FIV / FeLV'], pcr: ['PCR Cinomose'], exames: ['Ultrassom'] }))
    expect(res.status).toBe(200)
    const o = (gerarPdf.mock.calls[0][0] as { orcamento: { linhas: { nome: string }[]; total_pix: number; total_cartao: number } }).orcamento
    expect(o.linhas.map(l => l.nome)).toEqual(['Ultrassom', 'Teste Rápido — Combo FIV / FeLV', 'PCR — PCR Cinomose'])
    expect(o.total_pix).toBe(250 + 160 + 300)
    expect(o.total_cartao).toBe(275 + 170 + 330)
  })

  it('teste rápido sem valor cadastrado (preço 0) é recusado, não vira R$ 0', async () => {
    const res = await POST(req({ paciente: 'Thor', testes_rapidos: ['Leptospirose'] }))
    expect(res.status).toBe(400)
    expect(gerarPdf).not.toHaveBeenCalled()
  })

  it('nome que não existe no catálogo é recusado', async () => {
    expect((await POST(req({ paciente: 'Thor', pcr: ['PCR Inventado'] }))).status).toBe(400)
  })

  it('exige sessão', async () => {
    expect((await POST(req({ paciente: 'Thor', pcr: ['PCR Cinomose'] }, 'x'))).status).toBe(401)
  })
})

describe('GET /api/orcamento — catálogo da tela', () => {
  it('lista teste rápido e PCR com valor e esconde os sem valor cadastrado', async () => {
    const res = await GET(new NextRequest('http://localhost/api/orcamento', { headers: { cookie: 'sess=ok' } }))
    const j = await res.json()
    expect(j.testes_rapidos).toEqual([{ nome: 'Combo FIV / FeLV', pix: 160 }])
    expect(j.pcr).toEqual([{ nome: 'PCR Cinomose', pix: 300 }])
    expect(j.bioquimica).toEqual([{ nome: 'Glicose', pix: 20 }])
  })
})

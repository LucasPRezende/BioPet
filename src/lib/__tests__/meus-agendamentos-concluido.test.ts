import { describe, it, expect, vi } from 'vitest'
import { NextRequest } from 'next/server'

// Agendamento marcado como 'concluído' no painel (a equipe faz isso quando o
// pagamento cai) antes do horário do exame não pode sumir para a IA — caso
// Rihanna, 26/10/2026.

const filtrosIn: { tabela: string; col: string; vals: unknown[] }[] = []

vi.mock('@/lib/agent-auth', () => ({ verifyAgentKey: () => true }))
vi.mock('@/lib/agendamento-helpers', () => ({ agoraLocalISO: () => '2026-10-26T10:00:00' }))
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (t: string) => {
      const b: Record<string, unknown> = {}
      let statusDestaConsulta: unknown[] = []
      for (const m of ['select', 'eq', 'gt', 'order', 'limit', 'or']) b[m] = () => b
      b.in = (col: string, vals: unknown[]) => { statusDestaConsulta = vals; filtrosIn.push({ tabela: t, col, vals }); return b }
      b.maybeSingle = async () => ({ data: t === 'tutores' ? { id: 7 } : null, error: null })
      b.then = (res: (v: unknown) => void) => res({
        data: t === 'agendamentos' && statusDestaConsulta.includes('agendado')
          ? [{ id: 811, tipo_exame: 'Ultrassom Abdominal Total', data_hora: '2026-10-26T12:00:00', status: 'concluído', valor: 180, forma_pagamento: 'pix', pets: { nome: 'Rihanna' } }]
          : [],
        error: null,
      })
      return b
    },
  },
}))

import { GET } from '@/app/api/agente/meus-agendamentos/route'

describe('GET /api/agente/meus-agendamentos', () => {
  it("consulta inclui 'concluído' e devolve o agendamento pago antes do horário", async () => {
    const res = await GET(new NextRequest('http://localhost/api/agente/meus-agendamentos?telefone=5524993151033'))
    const json = await res.json()

    const ativos = filtrosIn.find(f => f.tabela === 'agendamentos' && f.vals.includes('agendado'))!
    expect(ativos.vals).toContain('concluído')
    expect(json.agendamentos).toHaveLength(1)
    expect(json.agendamentos[0]).toMatchObject({ id: 811, status: 'concluído', pet_nome: 'Rihanna', ja_comecou: false })
  })
})

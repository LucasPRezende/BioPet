import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// A notificação da equipe dizia "Remarcação" mesmo quando a IA só trocou o
// veterinário ou o pagamento — a equipe ia conferir uma data que não mudou.

const notificacoes: Record<string, unknown>[] = []
const atual = {
  id: 817, data_hora: '2026-11-04T09:30:00', duracao_minutos: 30, status: 'agendado',
  forma_pagamento: 'pix', encaixe: false, valor: 180, observacoes: null,
  tutores: { telefone: '5524999488507', nome: 'Alessandra' },
}

vi.mock('@/lib/agent-auth', () => ({ verifyAgentKey: () => true }))
vi.mock('@/lib/agendamento-helpers', () => ({
  precificarExames: async () => [], recalcularTotal: async () => 180, reconciliarLinkPagamento: async () => {},
}))
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (t: string) => {
      const b: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'neq', 'gte', 'lte']) b[m] = () => b
      b.single = async () => ({ data: t === 'agendamentos' ? atual : null, error: null })
      b.maybeSingle = async () => ({ data: t === 'veterinarios' ? { id: 25 } : null, error: null })
      b.update = () => ({ eq: async () => ({ error: null }) })
      b.insert = async (row: Record<string, unknown>) => { if (t === 'notificacoes') notificacoes.push(row); return { error: null } }
      b.then = (res: (v: unknown) => void) => res({ data: [], error: null })
      return b
    },
  },
}))

import { PATCH } from '@/app/api/agente/remarcar/route'

const patch = (body: Record<string, unknown>) => PATCH(new NextRequest('http://localhost/api/agente/remarcar?id=817', {
  method: 'PATCH', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ telefone: '5524999488507', ...body }),
}))

describe('PATCH /api/agente/remarcar — notificação para a equipe', () => {
  beforeEach(() => { notificacoes.length = 0 })

  it('só trocou o veterinário → "alteracao", não "remarcacao"', async () => {
    const res = await patch({ veterinario_id: 25 })
    expect(res.status).toBe(200)
    expect(notificacoes).toHaveLength(1)
    expect(notificacoes[0]).toMatchObject({ tipo_evento: 'alteracao', agendamento_id: 817, mensagem_ia: 'Veterinário trocado' })
  })

  it('mudou a data/hora → "remarcacao" com o de/para', async () => {
    await patch({ nova_data_hora: '2026-11-05T10:00:00' })
    expect(notificacoes[0]).toMatchObject({ tipo_evento: 'remarcacao' })
    expect(String(notificacoes[0].mensagem_ia)).toContain('04/11 às 09:30 → 05/11 às 10:00')
  })
})

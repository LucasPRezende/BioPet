import { describe, it, expect, vi, beforeEach } from 'vitest'

// O backend confere se o veterinario_id escolhido pela IA é a pessoa que o
// cliente citou (caso 817, 28/10/2026: Dr. Yves virou o id da Andreza).

const VETS: Record<number, string> = { 8: 'ANDREZA CARVALHO', 25: 'YVES DE ALMEIDA ROQUE' }

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => {
      let id = 0
      const b: Record<string, unknown> = {}
      b.select = () => b
      b.eq = (_c: string, v: number) => { id = v; return b }
      b.maybeSingle = async () => ({ data: VETS[id] ? { nome: VETS[id] } : null, error: null })
      return b
    },
  },
}))

import { executarTool } from '@/lib/agente/orquestrador'

const fetchMock = vi.fn()

describe('executarTool — veterinario_id conferido pelo nome', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ agendamento_id: 1 }) })
    vi.stubGlobal('fetch', fetchMock)
  })

  const agendar = (extra: Record<string, unknown>) =>
    executarTool('agendar', { tutor_id: 1, pet_id: 2, data_hora: '2026-10-30T09:00:00', ...extra }, '5524999999999')

  it('id de outra pessoa (8 = Andreza) para "Dr. Yves" → recusa e NÃO chama a API', async () => {
    const r = await agendar({ veterinario_id: 8, veterinario_nome: 'Dr. Yves' }) as { erro: boolean; mensagem: string }
    expect(r.erro).toBe(true)
    expect(r.mensagem).toContain('ANDREZA')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('id certo (25 = Yves) passa, e veterinario_nome não vaza para a API', async () => {
    await agendar({ veterinario_id: 25, veterinario_nome: 'Dr. Yves' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const corpo = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(corpo.veterinario_id).toBe(25)
    expect(corpo).not.toHaveProperty('veterinario_nome')
  })

  it('veterinario_id sem veterinario_nome → pede o nome, sem chamar a API', async () => {
    const r = await agendar({ veterinario_id: 25 }) as { erro: boolean }
    expect(r.erro).toBe(true)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('sem veterinario_id (cliente não sabe o vet) segue normal', async () => {
    await agendar({})
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('remarcar_agendamento só com veterinario_id errado também é barrado', async () => {
    const r = await executarTool('remarcar_agendamento', { agendamento_id: 5, veterinario_id: 8, veterinario_nome: 'Yves' }, '5524999999999') as { erro: boolean }
    expect(r.erro).toBe(true)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

// Rota que o cron da VPS chama de 5 em 5 min: decide e avisa por Telegram
// quando a IA para de receber mensagens (caso 04/11/2026).

const { enviarTelegram, chave } = vi.hoisted(() => ({
  enviarTelegram: vi.fn(async (_t: string) => true),
  chave: { valida: true },
}))

vi.mock('@/lib/agent-auth', () => ({ verifyAgentKey: () => chave.valida }))
vi.mock('@/lib/telegram', () => ({ enviarTelegram }))

import { GET } from '@/app/api/agente/saude/route'
import { registrarWebhookRecebido } from '@/lib/agente/vigia'

const fetchMock = vi.fn()
const chamar = (qs = '') => GET(new NextRequest(`http://localhost/api/agente/saude${qs}`))
const T0 = new Date('2026-11-04T15:00:00Z') // quarta 12:00 BRT
const avancar = (m: number) => vi.setSystemTime(new Date(T0.getTime() + m * 60_000))

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(T0)
  delete (globalThis as Record<string, unknown>).__biopetVigia
  chave.valida = true
  enviarTelegram.mockReset()
  enviarTelegram.mockResolvedValue(true)
  fetchMock.mockReset()
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ instance: { state: 'open' } }) })
  vi.stubGlobal('fetch', fetchMock)
  process.env.EVOLUTION_API_URL = 'http://evo'
  process.env.EVOLUTION_API_KEY = 'k'
  process.env.EVOLUTION_INSTANCE = 'Biopet'
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('GET /api/agente/saude', () => {
  it('sem a chave do agente responde 401 e não avisa ninguém', async () => {
    chave.valida = false
    const res = await chamar()
    expect(res.status).toBe(401)
    expect(enviarTelegram).not.toHaveBeenCalled()
  })

  it('?teste=1 só manda a mensagem de teste', async () => {
    const res = await chamar('?teste=1')
    expect(await res.json()).toEqual({ teste: true, enviado: true })
    expect(enviarTelegram).toHaveBeenCalledTimes(1)
  })

  it('ciclo completo: silêncio → alerta uma vez → recuperou', async () => {
    await chamar() // app "sobe" aqui (12:00)
    expect(enviarTelegram).not.toHaveBeenCalled()

    avancar(31) // 31 min sem nenhum webhook
    const r1 = await (await chamar()).json()
    expect(r1.acao).toBe('alertar')
    expect(enviarTelegram).toHaveBeenCalledTimes(1)
    expect(enviarTelegram.mock.calls[0][0]).toContain('🚨')

    avancar(36) // continua mudo, mas ainda dentro do tempo de reaviso
    expect((await (await chamar()).json()).acao).toBe('nada')
    expect(enviarTelegram).toHaveBeenCalledTimes(1)

    avancar(40)
    registrarWebhookRecebido() // webhook voltou
    const r3 = await (await chamar()).json()
    expect(r3.acao).toBe('recuperou')
    expect(enviarTelegram).toHaveBeenCalledTimes(2)
    expect(enviarTelegram.mock.calls[1][0]).toContain('✅')
  })

  it('se o Telegram falhar, não dá o alerta como avisado: tenta de novo no próximo ciclo', async () => {
    await chamar()
    avancar(31)
    enviarTelegram.mockResolvedValueOnce(false)
    const r1 = await (await chamar()).json()
    expect(r1).toMatchObject({ acao: 'alertar', telegram_enviado: false })

    avancar(36)
    const r2 = await (await chamar()).json()
    expect(r2).toMatchObject({ acao: 'alertar', telegram_enviado: true })
    expect(enviarTelegram).toHaveBeenCalledTimes(2)
  })

  it('Evolution fora do ar em horário de atendimento vira alerta', async () => {
    registrarWebhookRecebido()
    fetchMock.mockRejectedValue(new Error('timeout'))
    const r = await (await chamar()).json()
    expect(r).toMatchObject({ acao: 'alertar', estado_instancia: null })
  })
})

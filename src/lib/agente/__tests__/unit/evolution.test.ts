import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const registrarMensagemEnviadaMock = vi.fn()
vi.mock('@/lib/agente/outbound', () => ({
  registrarMensagemEnviada: (...args: any[]) => registrarMensagemEnviadaMock(...args),
}))

import { sendWhatsAppText, sendWhatsAppDocument } from '@/lib/evolution'

const ENV = {
  EVOLUTION_API_URL: 'https://evolution.biopetvet.com',
  EVOLUTION_API_KEY: 'chave-teste',
  EVOLUTION_INSTANCE: 'Biopet',
}

beforeEach(() => {
  registrarMensagemEnviadaMock.mockReset()
  Object.assign(process.env, ENV)
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('sendWhatsAppText', () => {
  it('mensagem do SISTEMA: registra com o texto (vira contexto pendente da IA)', async () => {
    ;(fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ key: { id: 'WAMID_SISTEMA' } }),
    })

    const ok = await sendWhatsAppText('24981367482', 'Seu link de pagamento: http://x', 'sistema')

    expect(ok).toBe(true)
    expect(registrarMensagemEnviadaMock).toHaveBeenCalledWith(
      '5524981367482',
      'WAMID_SISTEMA',
      'sistema',
      'Seu link de pagamento: http://x',
    )
  })

  it('mensagem da IA: registra SEM texto (já está no histórico da conversa)', async () => {
    ;(fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ key: { id: 'WAMID_IA' } }),
    })

    await sendWhatsAppText('24981367482', 'Oi! Posso ajudar a marcar seu exame.', 'ia')

    expect(registrarMensagemEnviadaMock).toHaveBeenCalledWith(
      '5524981367482',
      'WAMID_IA',
      'ia',
      null,
    )
  })

  it('default de origem é "sistema" quando não informado (chamadas legadas)', async () => {
    ;(fetch as any).mockResolvedValue({ ok: true, json: async () => ({ key: { id: 'WAMID_X' } }) })

    await sendWhatsAppText('24981367482', 'Convite cadastrado')

    expect(registrarMensagemEnviadaMock).toHaveBeenCalledWith(
      '5524981367482',
      'WAMID_X',
      'sistema',
      'Convite cadastrado',
    )
  })

  it('falha no envio (Evolution fora do ar): NÃO registra e retorna false', async () => {
    ;(fetch as any).mockResolvedValue({ ok: false, status: 500, text: async () => 'erro' })

    const ok = await sendWhatsAppText('24981367482', 'texto', 'sistema')

    expect(ok).toBe(false)
    expect(registrarMensagemEnviadaMock).not.toHaveBeenCalled()
  })

  it('envs da Evolution ausentes: não envia nem registra', async () => {
    delete process.env.EVOLUTION_API_URL
    const ok = await sendWhatsAppText('24981367482', 'texto', 'sistema')
    expect(ok).toBe(false)
    expect(fetch).not.toHaveBeenCalled()
    expect(registrarMensagemEnviadaMock).not.toHaveBeenCalled()
  })
})

describe('sendWhatsAppDocument', () => {
  it('registra o envio do documento com a origem informada (sem texto)', async () => {
    ;(fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ key: { id: 'WAMID_DOC' } }),
    })

    const ok = await sendWhatsAppDocument(
      '24981367482',
      'base64conteudo',
      'laudo.pdf',
      'Seu laudo',
      'ia',
    )

    expect(ok).toBe(true)
    expect(registrarMensagemEnviadaMock).toHaveBeenCalledWith('5524981367482', 'WAMID_DOC', 'ia', null)
  })
})

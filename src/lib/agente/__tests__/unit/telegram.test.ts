import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { enviarTelegram } from '@/lib/telegram'

describe('enviarTelegram', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockReset()
    process.env.TELEGRAM_BOT_TOKEN = 'TOKEN123'
    process.env.TELEGRAM_CHAT_ID = '999'
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.TELEGRAM_BOT_TOKEN
    delete process.env.TELEGRAM_CHAT_ID
  })

  it('sem token ou chat id não chama a rede e devolve false', async () => {
    delete process.env.TELEGRAM_BOT_TOKEN
    expect(await enviarTelegram('oi')).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('manda o texto para o chat configurado', async () => {
    fetchMock.mockResolvedValue({ ok: true })
    expect(await enviarTelegram('alerta')).toBe(true)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.telegram.org/botTOKEN123/sendMessage')
    expect(JSON.parse(init.body)).toEqual({ chat_id: '999', text: 'alerta' })
  })

  it('resposta de erro do Telegram devolve false e não vaza o token no log', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 400 })
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await enviarTelegram('alerta')).toBe(false)
    expect(JSON.stringify(erro.mock.calls)).not.toContain('TOKEN123')
    erro.mockRestore()
  })

  it('falha de rede devolve false em vez de estourar', async () => {
    fetchMock.mockRejectedValue(new Error('rede caiu'))
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await enviarTelegram('alerta')).toBe(false)
    erro.mockRestore()
  })
})

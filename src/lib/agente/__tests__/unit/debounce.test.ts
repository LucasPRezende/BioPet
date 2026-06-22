import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { enfileirarMensagem } from '@/lib/agente/debounce'

// DELAY padrão = 8000ms (AGENTE_DEBOUNCE_MS).
const JANELA = 8000

describe('enfileirarMensagem (debounce)', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('junta mensagens fragmentadas numa só chamada após a janela', async () => {
    const recebidas: string[] = []
    const cb = vi.fn(async (texto: string) => { recebidas.push(texto) })

    enfileirarMensagem('5511', 'oi', 'm1', 'Fulano', cb)
    enfileirarMensagem('5511', 'tudo bem?', 'm2', 'Fulano', cb)
    enfileirarMensagem('5511', 'queria marcar', 'm3', 'Fulano', cb)

    // Antes da janela fechar, nada foi processado.
    vi.advanceTimersByTime(JANELA - 1)
    expect(cb).not.toHaveBeenCalled()

    // Fechou a janela → uma única chamada com o texto concatenado.
    vi.advanceTimersByTime(1)
    expect(cb).toHaveBeenCalledTimes(1)
    expect(recebidas[0]).toBe('oi\ntudo bem?\nqueria marcar')
  })

  it('reinicia a janela a cada nova mensagem', () => {
    const cb = vi.fn(async () => {})
    enfileirarMensagem('5522', 'a', 'm1', undefined, cb)
    vi.advanceTimersByTime(JANELA - 1000)
    enfileirarMensagem('5522', 'b', 'm2', undefined, cb) // reinicia
    vi.advanceTimersByTime(JANELA - 1000)
    expect(cb).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1000)
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it('deduplica mensagens com o mesmo msgId', () => {
    const recebidas: string[] = []
    const cb = vi.fn(async (texto: string) => { recebidas.push(texto) })
    enfileirarMensagem('5533', 'a', 'dup', undefined, cb)
    enfileirarMensagem('5533', 'a', 'dup', undefined, cb) // ignorada
    vi.advanceTimersByTime(JANELA)
    expect(recebidas[0]).toBe('a')
  })

  it('telefones diferentes têm buffers independentes', () => {
    const cb = vi.fn(async () => {})
    enfileirarMensagem('5544', 'x', 'm1', undefined, cb)
    enfileirarMensagem('5555', 'y', 'm2', undefined, cb)
    vi.advanceTimersByTime(JANELA)
    expect(cb).toHaveBeenCalledTimes(2)
  })
})

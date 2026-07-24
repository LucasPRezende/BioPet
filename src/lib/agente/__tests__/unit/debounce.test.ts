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

  // Regressão: texto (debounce direto) e mídia (Gemini → debounce, com atraso
  // variável) podem abrir uma SEGUNDA janela para o mesmo telefone enquanto a
  // PRIMEIRA ainda está processando (chamando o modelo, salvando o histórico).
  // Sem serialização, as duas rodavam em paralelo e uma sobrescrevia o
  // histórico da outra — a IA "esquecia" parte da conversa e se apresentava
  // de novo. `processar` do MESMO telefone tem que esperar a anterior acabar.
  it('serializa: 2ª janela do MESMO telefone espera a 1ª terminar de processar', async () => {
    const eventos: string[] = []
    let liberarPrimeira!: () => void
    const travaPrimeira = new Promise<void>((r) => { liberarPrimeira = r })

    const cb = vi.fn(async (texto: string) => {
      eventos.push('inicio:' + texto)
      if (texto === 'primeira') await travaPrimeira
      eventos.push('fim:' + texto)
    })

    enfileirarMensagem('5566', 'primeira', 'm1', undefined, cb)
    vi.advanceTimersByTime(JANELA)
    expect(eventos).toEqual(['inicio:primeira']) // 1ª começou (fila vazia antes dela)

    // 2ª mensagem chega e fecha sua PRÓPRIA janela enquanto a 1ª ainda está presa.
    enfileirarMensagem('5566', 'segunda', 'm2', undefined, cb)
    vi.advanceTimersByTime(JANELA)
    expect(eventos).toEqual(['inicio:primeira']) // 2ª NÃO pode ter começado ainda

    liberarPrimeira()
    for (let i = 0; i < 10; i++) await Promise.resolve() // deixa a fila avançar

    expect(eventos).toEqual(['inicio:primeira', 'fim:primeira', 'inicio:segunda', 'fim:segunda'])
  })
})

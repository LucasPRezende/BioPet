import { describe, it, expect, vi, beforeEach } from 'vitest'

/** Builder encadeável que resolve como Promise (imita o PostgrestFilterBuilder). */
function makeBuilder(result: any) {
  const builder: any = {}
  for (const m of ['select', 'insert', 'update', 'eq', 'in', 'not', 'order']) {
    builder[m] = vi.fn(() => builder)
  }
  builder.maybeSingle = vi.fn(() => Promise.resolve(result))
  builder.then = (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject)
  return builder
}

const fromMock = vi.fn()
vi.mock('@/lib/supabase', () => ({
  supabase: { from: (...args: any[]) => fromMock(...args) },
}))

import {
  registrarMensagemEnviada,
  classificarFromMe,
  registrarHumano,
  contextoPendente,
  mensagemRecente,
} from '@/lib/agente/outbound'

const horasAtras = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString()

beforeEach(() => {
  fromMock.mockReset()
})

describe('registrarMensagemEnviada', () => {
  it('grava telefone normalizado, msg_id, origem e texto', async () => {
    const builder = makeBuilder({ data: null, error: null })
    fromMock.mockReturnValue(builder)

    await registrarMensagemEnviada('24981367482', 'MSG1', 'sistema', 'Seu link: http://x')

    expect(fromMock).toHaveBeenCalledWith('agente_mensagens_enviadas')
    expect(builder.insert).toHaveBeenCalledWith({
      telefone: '5524981367482',
      msg_id: 'MSG1',
      origem: 'sistema',
      texto: 'Seu link: http://x',
    })
  })

  it('nunca lança — erro de DB é engolido (degradação segura)', async () => {
    fromMock.mockImplementation(() => {
      throw new Error('tabela não existe')
    })

    await expect(registrarMensagemEnviada('24981367482', 'MSG1', 'ia')).resolves.toBeUndefined()
  })
})

describe('registrarHumano', () => {
  it('registra com origem "humano" e o texto do atendente', async () => {
    const builder = makeBuilder({ data: null, error: null })
    fromMock.mockReturnValue(builder)

    await registrarHumano('24981367482', 'MSG2', 'já te atendo')

    expect(builder.insert).toHaveBeenCalledWith({
      telefone: '5524981367482',
      msg_id: 'MSG2',
      origem: 'humano',
      texto: 'já te atendo',
    })
  })
})

describe('classificarFromMe', () => {
  it('sem msgId → "erro" (não consulta o banco)', async () => {
    const r = await classificarFromMe(undefined)
    expect(r).toBe('erro')
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('id conhecido (nosso) → devolve a origem gravada', async () => {
    fromMock.mockReturnValue(makeBuilder({ data: { origem: 'ia' }, error: null }))
    expect(await classificarFromMe('MSG_IA')).toBe('ia')

    fromMock.mockReturnValue(makeBuilder({ data: { origem: 'sistema' }, error: null }))
    expect(await classificarFromMe('MSG_SISTEMA')).toBe('sistema')
  })

  it('id desconhecido (sem registro) → "humano"', async () => {
    fromMock.mockReturnValue(makeBuilder({ data: null, error: null }))
    expect(await classificarFromMe('MSG_HUMANO')).toBe('humano')
  })

  it('falha na consulta → "erro" (NÃO deve virar "humano" e pausar a IA à toa)', async () => {
    fromMock.mockReturnValue(makeBuilder({ data: null, error: { message: 'timeout' } }))
    expect(await classificarFromMe('MSG_X')).toBe('erro')
  })
})

describe('contextoPendente', () => {
  it('sem mensagens pendentes → string vazia', async () => {
    fromMock.mockReturnValue(makeBuilder({ data: [], error: null }))
    expect(await contextoPendente('24981367482')).toBe('')
  })

  it('formata mensagens de sistema e humano, e marca como consumidas', async () => {
    const selectBuilder = makeBuilder({
      data: [
        { id: 1, origem: 'sistema', texto: 'Seu  agendamento   foi confirmado', criado_em: horasAtras(2) },
        { id: 2, origem: 'humano', texto: 'pode vir em jejum', criado_em: horasAtras(1) },
      ],
      error: null,
    })
    const updateBuilder = makeBuilder({ data: null, error: null })
    fromMock.mockReturnValueOnce(selectBuilder).mockReturnValueOnce(updateBuilder)

    const texto = await contextoPendente('24981367482')

    expect(texto).toBe(
      '- Sistema enviou ao cliente: "Seu agendamento foi confirmado"\n' +
        '- Atendente humano enviou: "pode vir em jejum"',
    )
    // consulta filtrou pelas mensagens não consumidas, de sistema/humano
    expect(selectBuilder.eq).toHaveBeenCalledWith('consumido', false)
    expect(selectBuilder.in).toHaveBeenCalledWith('origem', ['sistema', 'humano'])
    // marcou as duas linhas retornadas como consumidas
    expect(updateBuilder.update).toHaveBeenCalledWith({ consumido: true })
    expect(updateBuilder.in).toHaveBeenCalledWith('id', [1, 2])
  })

  it('mensagem com mais de 72h NÃO entra no prompt, mas é marcada como consumida', async () => {
    const selectBuilder = makeBuilder({
      data: [
        { id: 1, origem: 'sistema', texto: 'Jade confirmada pra 21/09', criado_em: horasAtras(24 * 21) },
        { id: 2, origem: 'sistema', texto: 'Seu link de pagamento', criado_em: horasAtras(3) },
      ],
      error: null,
    })
    const updateBuilder = makeBuilder({ data: null, error: null })
    fromMock.mockReturnValueOnce(selectBuilder).mockReturnValueOnce(updateBuilder)

    const texto = await contextoPendente('24981367482')

    expect(texto).toBe('- Sistema enviou ao cliente: "Seu link de pagamento"')
    expect(updateBuilder.in).toHaveBeenCalledWith('id', [1, 2])
  })

  it('só mensagens velhas → string vazia', async () => {
    fromMock
      .mockReturnValueOnce(makeBuilder({
        data: [{ id: 1, origem: 'sistema', texto: 'velha', criado_em: horasAtras(24 * 10) }],
        error: null,
      }))
      .mockReturnValueOnce(makeBuilder({ data: null, error: null }))
    expect(await contextoPendente('24981367482')).toBe('')
  })

  it('erro de DB (ex.: coluna/tabela ausente) → string vazia, não lança', async () => {
    fromMock.mockImplementation(() => {
      throw new Error('coluna consumido não existe')
    })
    await expect(contextoPendente('24981367482')).resolves.toBe('')
  })
})

describe('mensagemRecente', () => {
  const agora = new Date('2026-10-02T12:00:00Z')
  it('dentro de 72h → true; fora → false', () => {
    expect(mensagemRecente('2026-10-01T12:00:00Z', agora)).toBe(true)
    expect(mensagemRecente('2026-09-28T12:00:00Z', agora)).toBe(false)
  })
  it('timestamp sem fuso é tratado como UTC; offset explícito é respeitado', () => {
    expect(mensagemRecente('2026-10-02T11:00:00', agora)).toBe(true)
    expect(mensagemRecente('2026-10-02T09:00:00-03:00', agora)).toBe(true)
  })
  it('data inválida → false', () => {
    expect(mensagemRecente('lixo', agora)).toBe(false)
  })
})

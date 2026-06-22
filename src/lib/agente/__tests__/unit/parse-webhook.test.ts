import { describe, it, expect } from 'vitest'
import { parseEvolutionWebhook } from '@/lib/agente/conversa'

/** Payload base de um messages.upsert (instância usa addressingMode "lid"). */
function payload(over: Record<string, any> = {}) {
  return {
    event: 'messages.upsert',
    data: {
      key: {
        remoteJid: '28278182142054@lid',
        remoteJidAlt: '5524981367482@s.whatsapp.net',
        fromMe: false,
        id: 'ABC123',
        ...(over.key ?? {}),
      },
      pushName: 'Lucas Rezende',
      message: { conversation: 'Olá', ...(over.message ?? {}) },
      ...(over.data ?? {}),
    },
    ...(over.root ?? {}),
  }
}

describe('parseEvolutionWebhook', () => {
  it('resolve o telefone real pelo remoteJidAlt (ignora o @lid)', () => {
    const r = parseEvolutionWebhook(payload())
    expect(r.processavel).toBe(true)
    expect(r.telefone).toBe('5524981367482')
    expect(r.texto).toBe('Olá')
    expect(r.msgId).toBe('ABC123')
    expect(r.pushName).toBe('Lucas Rezende')
  })

  it('ignora mensagens próprias (fromMe)', () => {
    const r = parseEvolutionWebhook(payload({ key: { fromMe: true } }))
    expect(r.processavel).toBe(false)
    expect(r.motivo).toBe('fromMe')
  })

  it('ignora mensagens de grupo (@g.us)', () => {
    const r = parseEvolutionWebhook(payload({ key: { remoteJid: '123@g.us' } }))
    expect(r.processavel).toBe(false)
    expect(r.motivo).toBe('grupo')
  })

  it('ignora eventos que não são messages.upsert', () => {
    const r = parseEvolutionWebhook({ event: 'messages.update', data: {} })
    expect(r.processavel).toBe(false)
  })

  it('ignora mensagens sem texto', () => {
    const r = parseEvolutionWebhook(payload({ message: { conversation: undefined } }))
    expect(r.processavel).toBe(false)
    expect(r.motivo).toBe('mensagem sem texto')
  })

  it('extrai texto de extendedTextMessage', () => {
    const r = parseEvolutionWebhook(
      payload({ message: { conversation: undefined, extendedTextMessage: { text: 'oi estendido' } } }),
    )
    expect(r.processavel).toBe(true)
    expect(r.texto).toBe('oi estendido')
  })

  it('quando só há @lid (sem remoteJidAlt), descarta por falta de telefone', () => {
    const r = parseEvolutionWebhook(payload({ key: { remoteJidAlt: undefined } }))
    expect(r.processavel).toBe(false)
    expect(r.motivo).toContain('telefone')
  })

  it('normaliza telefone sem DDI 55 adicionando o prefixo', () => {
    const r = parseEvolutionWebhook(
      payload({ key: { remoteJid: '24981367482@s.whatsapp.net', remoteJidAlt: undefined } }),
    )
    expect(r.processavel).toBe(true)
    expect(r.telefone).toBe('5524981367482')
  })

  it('faz trim do texto', () => {
    const r = parseEvolutionWebhook(payload({ message: { conversation: '  oi  ' } }))
    expect(r.texto).toBe('oi')
  })

  it('detecta áudio (audioMessage) e carrega a key para buscar o base64', () => {
    const r = parseEvolutionWebhook(
      payload({ message: { conversation: undefined, audioMessage: { mimetype: 'audio/ogg', ptt: true } } }),
    )
    expect(r.processavel).toBe(true)
    expect(r.tipoMidia).toBe('audio')
    expect(r.telefone).toBe('5524981367482')
    expect(r.rawKey?.id).toBe('ABC123')
  })

  it('detecta imagem (imageMessage) e captura a legenda', () => {
    const r = parseEvolutionWebhook(
      payload({
        message: { conversation: undefined, imageMessage: { mimetype: 'image/jpeg', caption: 'encaminhamento do Rex' } },
      }),
    )
    expect(r.processavel).toBe(true)
    expect(r.tipoMidia).toBe('imagem')
    expect(r.legenda).toBe('encaminhamento do Rex')
  })

  it('detecta documento (PDF) direto', () => {
    const r = parseEvolutionWebhook(
      payload({
        message: { conversation: undefined, documentMessage: { mimetype: 'application/pdf', fileName: 'encaminhamento.pdf' } },
      }),
    )
    expect(r.processavel).toBe(true)
    expect(r.tipoMidia).toBe('documento')
    expect(r.legenda).toBe('encaminhamento.pdf')
  })

  it('detecta documento embrulhado (documentWithCaptionMessage)', () => {
    const r = parseEvolutionWebhook(
      payload({
        message: {
          conversation: undefined,
          documentWithCaptionMessage: {
            message: { documentMessage: { mimetype: 'application/pdf', caption: 'laudo do Rex', fileName: 'x.pdf' } },
          },
        },
      }),
    )
    expect(r.processavel).toBe(true)
    expect(r.tipoMidia).toBe('documento')
    expect(r.legenda).toBe('laudo do Rex')
  })

  it('ignora mídia de mensagem própria (fromMe) também', () => {
    const r = parseEvolutionWebhook(
      payload({ key: { fromMe: true }, message: { conversation: undefined, audioMessage: {} } }),
    )
    expect(r.processavel).toBe(false)
    expect(r.motivo).toBe('fromMe')
  })
})

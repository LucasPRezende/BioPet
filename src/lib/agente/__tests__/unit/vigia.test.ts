import { describe, it, expect, beforeEach } from 'vitest'
import {
  decidirVigia,
  emHorarioDeAtendimento,
  silencioEmMin,
  registrarWebhookRecebido,
  lerEstadoVigia,
  aplicarDecisao,
  LIMITE_SILENCIO_MIN,
  REAVISO_MIN,
  type EstadoVigia,
} from '@/lib/agente/vigia'

/**
 * Caso real de 04/11/2026: a sessão do WhatsApp ficou "surda" e a IA passou
 * 3h30 sem receber nada, sem ninguém ser avisado. O vigia avisa quando o app
 * para de receber webhook em horário de atendimento.
 *
 * Datas em UTC; Brasília = UTC-3. 04/11/2026 é quarta-feira.
 */

const QUARTA_12H = new Date('2026-11-04T15:00:00Z') // 12:00 BRT
const min = (m: number) => m * 60_000
const depois = (d: Date, m: number) => new Date(d.getTime() + min(m))

function estado(parcial: Partial<EstadoVigia> = {}): EstadoVigia {
  return {
    ultimoWebhookEm: null,
    iniciouEm: new Date('2026-11-04T10:00:00Z'),
    alertaAbertoEm: null,
    ultimoAvisoEm: null,
    ...parcial,
  }
}

describe('emHorarioDeAtendimento', () => {
  it('quarta ao meio-dia (Brasília) é horário de atendimento', () => {
    expect(emHorarioDeAtendimento(QUARTA_12H)).toBe(true)
  })
  it('sábado de manhã é horário de atendimento', () => {
    expect(emHorarioDeAtendimento(new Date('2026-11-07T15:00:00Z'))).toBe(true)
  })
  it('domingo nunca é', () => {
    expect(emHorarioDeAtendimento(new Date('2026-11-08T15:00:00Z'))).toBe(false)
  })
  it('antes das 8h e a partir das 19h (Brasília) não é', () => {
    expect(emHorarioDeAtendimento(new Date('2026-11-04T10:59:00Z'))).toBe(false) // 07:59 BRT
    expect(emHorarioDeAtendimento(new Date('2026-11-04T11:00:00Z'))).toBe(true) // 08:00 BRT
    expect(emHorarioDeAtendimento(new Date('2026-11-04T21:59:00Z'))).toBe(true) // 18:59 BRT
    expect(emHorarioDeAtendimento(new Date('2026-11-04T22:00:00Z'))).toBe(false) // 19:00 BRT
  })
})

describe('silencioEmMin', () => {
  it('conta do último webhook quando ele veio depois do boot', () => {
    const e = estado({ ultimoWebhookEm: depois(QUARTA_12H, -12) })
    expect(silencioEmMin(QUARTA_12H, e)).toBe(12)
  })
  it('sem webhook desde o boot, conta do boot', () => {
    const e = estado({ iniciouEm: depois(QUARTA_12H, -7) })
    expect(silencioEmMin(QUARTA_12H, e)).toBe(7)
  })
})

describe('decidirVigia', () => {
  it('silêncio abaixo do limite: não faz nada', () => {
    const e = estado({ ultimoWebhookEm: depois(QUARTA_12H, -(LIMITE_SILENCIO_MIN - 1)) })
    expect(decidirVigia({ agora: QUARTA_12H, estado: e, estadoInstancia: 'open' }).acao).toBe('nada')
  })

  it('silêncio no limite em horário de atendimento: alerta', () => {
    const e = estado({ ultimoWebhookEm: depois(QUARTA_12H, -LIMITE_SILENCIO_MIN) })
    const d = decidirVigia({ agora: QUARTA_12H, estado: e, estadoInstancia: 'open' })
    expect(d.acao).toBe('alertar')
    if (d.acao === 'alertar') {
      expect(d.mensagem).toContain('🚨')
      expect(d.mensagem).toContain(`${LIMITE_SILENCIO_MIN} min`)
      expect(d.mensagem).toContain('12:00')
    }
  })

  it('reproduz o 04/11: último webhook 9h34, às 10h10 já avisa (instância "open" não engana)', () => {
    const e = estado({ ultimoWebhookEm: new Date('2026-11-04T12:34:00Z') }) // 09:34 BRT
    const d = decidirVigia({ agora: new Date('2026-11-04T13:10:00Z'), estado: e, estadoInstancia: 'open' })
    expect(d.acao).toBe('alertar')
  })

  it('fora do horário (domingo) ninguém é acordado por silêncio', () => {
    const domingo = new Date('2026-11-08T15:00:00Z')
    const e = estado({ ultimoWebhookEm: depois(domingo, -600), iniciouEm: depois(domingo, -2000) })
    expect(decidirVigia({ agora: domingo, estado: e, estadoInstancia: 'open' }).acao).toBe('nada')
  })

  it('instância fora de "open" em horário de atendimento: alerta mesmo com webhook recente', () => {
    const e = estado({ ultimoWebhookEm: depois(QUARTA_12H, -2) })
    const d = decidirVigia({ agora: QUARTA_12H, estado: e, estadoInstancia: 'close' })
    expect(d.acao).toBe('alertar')
    if (d.acao === 'alertar') expect(d.mensagem).toContain('close')
  })

  it('não conseguir consultar a Evolution em horário de atendimento: alerta', () => {
    const e = estado({ ultimoWebhookEm: depois(QUARTA_12H, -1) })
    expect(decidirVigia({ agora: QUARTA_12H, estado: e, estadoInstancia: null }).acao).toBe('alertar')
  })

  it('app recém-subido sem webhook ainda: espera o limite contar do boot', () => {
    const recente = estado({ iniciouEm: depois(QUARTA_12H, -10) })
    expect(decidirVigia({ agora: QUARTA_12H, estado: recente, estadoInstancia: 'open' }).acao).toBe('nada')
    const antigo = estado({ iniciouEm: depois(QUARTA_12H, -40) })
    expect(decidirVigia({ agora: QUARTA_12H, estado: antigo, estadoInstancia: 'open' }).acao).toBe('alertar')
  })

  it('alerta já aberto: não repete antes do tempo de reaviso', () => {
    const e = estado({
      ultimoWebhookEm: depois(QUARTA_12H, -90),
      alertaAbertoEm: depois(QUARTA_12H, -50),
      ultimoAvisoEm: depois(QUARTA_12H, -(REAVISO_MIN - 5)),
    })
    expect(decidirVigia({ agora: QUARTA_12H, estado: e, estadoInstancia: 'open' }).acao).toBe('nada')
  })

  it('alerta já aberto: reavisa depois do tempo de reaviso', () => {
    const e = estado({
      ultimoWebhookEm: depois(QUARTA_12H, -150),
      alertaAbertoEm: depois(QUARTA_12H, -REAVISO_MIN - 1),
      ultimoAvisoEm: depois(QUARTA_12H, -REAVISO_MIN),
    })
    const d = decidirVigia({ agora: QUARTA_12H, estado: e, estadoInstancia: 'open' })
    expect(d.acao).toBe('reavisar')
    if (d.acao === 'reavisar') expect(d.mensagem).toContain('Continua o problema')
  })

  it('recuperou: chegou webhook depois do alerta e a instância está open', () => {
    const e = estado({
      ultimoWebhookEm: depois(QUARTA_12H, -1),
      alertaAbertoEm: depois(QUARTA_12H, -40),
      ultimoAvisoEm: depois(QUARTA_12H, -40),
    })
    const d = decidirVigia({ agora: QUARTA_12H, estado: e, estadoInstancia: 'open' })
    expect(d.acao).toBe('recuperou')
    if (d.acao === 'recuperou') expect(d.mensagem).toContain('✅')
  })

  it('fora do horário o silêncio não prova recuperação: alerta fica aberto, sem mensagem', () => {
    const noite = new Date('2026-11-04T23:00:00Z') // 20:00 BRT
    const e = estado({
      ultimoWebhookEm: new Date('2026-11-04T13:00:00Z'),
      alertaAbertoEm: new Date('2026-11-04T14:00:00Z'),
      ultimoAvisoEm: new Date('2026-11-04T14:00:00Z'),
    })
    expect(decidirVigia({ agora: noite, estado: e, estadoInstancia: 'open' }).acao).toBe('nada')
  })

  it('recuperou só com instância open (webhook recente sozinho não basta)', () => {
    const e = estado({
      ultimoWebhookEm: depois(QUARTA_12H, -1),
      alertaAbertoEm: depois(QUARTA_12H, -40),
      ultimoAvisoEm: depois(QUARTA_12H, -40),
    })
    expect(decidirVigia({ agora: QUARTA_12H, estado: e, estadoInstancia: 'connecting' }).acao).not.toBe('recuperou')
  })
})

describe('estado em memória', () => {
  beforeEach(() => {
    delete (globalThis as Record<string, unknown>).__biopetVigia
  })

  it('registrarWebhookRecebido guarda o horário', () => {
    const t = new Date('2026-11-04T15:00:00Z')
    registrarWebhookRecebido(t)
    expect(lerEstadoVigia().ultimoWebhookEm).toEqual(t)
  })

  it('aplicarDecisao abre, mantém e fecha o alerta', () => {
    const t = new Date('2026-11-04T15:00:00Z')
    aplicarDecisao({ acao: 'alertar', silencioMin: 40, motivos: [], mensagem: 'x' }, t)
    expect(lerEstadoVigia().alertaAbertoEm).toEqual(t)
    expect(lerEstadoVigia().ultimoAvisoEm).toEqual(t)

    const t2 = depois(t, 60)
    aplicarDecisao({ acao: 'reavisar', silencioMin: 100, motivos: [], mensagem: 'x' }, t2)
    expect(lerEstadoVigia().alertaAbertoEm).toEqual(t)
    expect(lerEstadoVigia().ultimoAvisoEm).toEqual(t2)

    aplicarDecisao({ acao: 'recuperou', silencioMin: 0, mensagem: 'ok' }, depois(t, 70))
    expect(lerEstadoVigia().alertaAbertoEm).toBeNull()
    expect(lerEstadoVigia().ultimoAvisoEm).toBeNull()
  })
})

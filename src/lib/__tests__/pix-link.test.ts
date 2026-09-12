import { describe, it, expect } from 'vitest'
import { pixLinkExpirado, PIX_LINK_VALIDADE_DIAS } from '../agendamento-helpers'

/**
 * O link PIX vai pro WhatsApp do tutor e fica lá pra sempre. A validade é o que
 * impede que um link encaminhado (ou um celular vendido) abra o recibo meses
 * depois — ela só é consultada para agendamento JÁ PAGO; em aberto o link
 * continua de pé pra cobrança retroativa. `data_hora` é naive (Brasília, sem
 * offset) e os casos abaixo são montados no mesmo fuso, pra não medir diferença
 * de timezone em vez de validade.
 */
const TZ = 'America/Sao_Paulo'

function dataHoraEm(offsetDias: number): string {
  const d = new Date(Date.now() + offsetDias * 24 * 60 * 60 * 1000)
  const data = d.toLocaleDateString('en-CA', { timeZone: TZ })
  const hora = d.toLocaleTimeString('en-GB', { timeZone: TZ, hour12: false })
  return `${data}T${hora}`
}

describe('pixLinkExpirado', () => {
  it('mantém válido o link de um exame que ainda vai acontecer', () => {
    expect(pixLinkExpirado(dataHoraEm(2))).toBe(false)
  })

  it('mantém válido dentro da janela de 7 dias após o exame', () => {
    expect(pixLinkExpirado(dataHoraEm(-(PIX_LINK_VALIDADE_DIAS - 1)))).toBe(false)
  })

  it('expira depois de 7 dias do exame', () => {
    expect(pixLinkExpirado(dataHoraEm(-(PIX_LINK_VALIDADE_DIAS + 1)))).toBe(true)
  })

  it('aceita data_hora com fração de segundo e offset', () => {
    const base = dataHoraEm(-(PIX_LINK_VALIDADE_DIAS + 1))
    expect(pixLinkExpirado(`${base}.123456`)).toBe(true)
    expect(pixLinkExpirado(`${base}-03:00`)).toBe(true)
  })

  it('não expira o que não dá pra avaliar (sem data ou data inválida)', () => {
    expect(pixLinkExpirado(null)).toBe(false)
    expect(pixLinkExpirado(undefined)).toBe(false)
    expect(pixLinkExpirado('nao-e-data')).toBe(false)
  })
})

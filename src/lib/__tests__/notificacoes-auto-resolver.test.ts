import { describe, it, expect } from 'vitest'
import { aplicarAutoResolucao, contarPendentes, expirou } from '../notificacoes'

// "Agora" fixo: 09/11/2026 12:00 UTC
const AGORA = Date.parse('2026-11-09T12:00:00Z')
const DIA = 24 * 60 * 60 * 1000

// criado_em como vem do Postgres: TIMESTAMP sem timezone (UTC, sem "Z")
function haDias(dias: number, extraMs = 0): string {
  return new Date(AGORA - dias * DIA - extraMs).toISOString().replace('Z', '')
}

function notif(criado_em: string, tipo_evento: string | null, visualizado = false) {
  return { id: Math.random(), criado_em, tipo_evento, visualizado }
}

describe('notificações: auto-resolver depois de 7 dias', () => {
  it('até 7 dias continua pendente; passou de 7 dias expira', () => {
    expect(expirou(haDias(0), AGORA)).toBe(false)
    expect(expirou(haDias(6), AGORA)).toBe(false)
    expect(expirou(haDias(7), AGORA)).toBe(false)          // exatamente 7 dias ainda conta
    expect(expirou(haDias(7, 60_000), AGORA)).toBe(true)   // 7 dias e 1 minuto
    expect(expirou(haDias(30), AGORA)).toBe(true)
  })

  it('lê criado_em sem "Z" como UTC (não desloca 3h)', () => {
    // 7 dias menos 2h: se fosse lido como horário local (UTC-3) passaria de 7 dias
    const quaseSete = new Date(AGORA - 7 * DIA + 2 * 60 * 60 * 1000).toISOString().replace('Z', '')
    expect(expirou(quaseSete, AGORA)).toBe(false)
  })

  it('pendente com mais de 7 dias vira resolvida automaticamente', () => {
    const [velha, nova] = aplicarAutoResolucao(
      [notif(haDias(8), 'ia_travou'), notif(haDias(2), 'ia_travou')],
      AGORA,
    )
    expect(velha).toMatchObject({ visualizado: true, auto_resolvido: true })
    expect(nova).toMatchObject({ visualizado: false, auto_resolvido: false })
  })

  it('a que já foi resolvida à mão não é marcada como automática', () => {
    const [n] = aplicarAutoResolucao([notif(haDias(10), 'ia_travou', true)], AGORA)
    expect(n).toMatchObject({ visualizado: true, auto_resolvido: false })
  })

  it('badge só conta pendências dos últimos 7 dias (atenção e agendamentos)', () => {
    const contagem = contarPendentes([
      notif(haDias(1), 'ia_travou'),
      notif(haDias(3), null),                 // notificação antiga sem tipo = requer atenção
      notif(haDias(9), 'pergunta_laudo'),     // expirou
      notif(haDias(20), null),                // expirou
      notif(haDias(1), 'agendamento'),
      notif(haDias(5), 'alteracao'),
      notif(haDias(8), 'cancelamento'),       // expirou
      notif(haDias(1), 'erro_tecnico', true), // já resolvida
    ], AGORA)
    expect(contagem).toEqual({ nao_visualizadas: 2, agendamentos_novos: 2 })
  })

  it('não altera a lista original', () => {
    const lista = [notif(haDias(10), 'ia_travou')]
    aplicarAutoResolucao(lista, AGORA)
    expect(lista[0].visualizado).toBe(false)
  })
})

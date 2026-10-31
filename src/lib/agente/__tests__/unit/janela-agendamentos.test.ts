import { describe, it, expect } from 'vitest'
import { limiteInferiorMeusAgendamentos, jaComecou, STATUS_MEUS_AGENDAMENTOS } from '@/lib/agente/janela-agendamentos'

describe('limiteInferiorMeusAgendamentos', () => {
  it('volta 2h do "agora" de Brasília (string naive)', () => {
    expect(limiteInferiorMeusAgendamentos('2026-10-15T14:30:00')).toBe('2026-10-15T12:30:00')
  })

  it('atravessa a meia-noite', () => {
    expect(limiteInferiorMeusAgendamentos('2026-10-16T01:00:00')).toBe('2026-10-15T23:00:00')
  })

  // Caso Ivanilza 15/10: "estou a caminho" no horário do exame — o agendamento
  // das 14h precisa continuar aparecendo às 14h20.
  it('agendamento que começou há 20 min ainda entra; o de 3h atrás não', () => {
    const limite = limiteInferiorMeusAgendamentos('2026-10-15T14:20:00')
    expect('2026-10-15T14:00:00' > limite).toBe(true)
    expect('2026-10-15T11:00:00' > limite).toBe(false)
  })
})

describe('jaComecou', () => {
  it('compara o horário marcado com o agora', () => {
    expect(jaComecou('2026-10-15T14:00:00', '2026-10-15T14:20:00')).toBe(true)
    expect(jaComecou('2026-10-15T15:00:00', '2026-10-15T14:20:00')).toBe(false)
  })
})

describe('STATUS_MEUS_AGENDAMENTOS', () => {
  it("inclui 'concluído': a equipe marca como concluído ao cair o pagamento, antes do exame (Rihanna, 26/10)", () => {
    expect(STATUS_MEUS_AGENDAMENTOS).toContain('concluído')
    expect(STATUS_MEUS_AGENDAMENTOS).toContain('agendado')
    expect(STATUS_MEUS_AGENDAMENTOS).not.toContain('cancelado')
    expect(STATUS_MEUS_AGENDAMENTOS).not.toContain('faltou')
  })
})

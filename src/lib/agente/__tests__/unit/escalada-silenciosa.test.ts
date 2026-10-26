import { describe, it, expect } from 'vitest'
import { escalouEmSilencio } from '@/lib/agente/escalada-silenciosa'

const transf = (entrada: Record<string, any>, resultado: unknown = { sucesso: true }) => ({
  nome: 'transferir_humano',
  resultado,
  entrada,
})

describe('escalouEmSilencio', () => {
  it('transferir_humano silencioso (ia_travou) sozinho ou após leitura → silêncio', () => {
    expect(escalouEmSilencio([transf({ motivo: 'ia_travou', silencioso: true, resumo: 'ASSUNTO PESSOAL: obra' })])).toBe(true)
    expect(
      escalouEmSilencio([
        { nome: 'identificar_tutor', resultado: {} },
        transf({ motivo: 'ia_travou', silencioso: true }),
      ]),
    ).toBe(true)
  })

  it('sem o flag, com outro motivo ou com erro → responde normalmente', () => {
    expect(escalouEmSilencio([transf({ motivo: 'ia_travou' })])).toBe(false)
    expect(escalouEmSilencio([transf({ motivo: 'pergunta_tecnica', silencioso: true })])).toBe(false)
    expect(escalouEmSilencio([transf({ motivo: 'ia_travou', silencioso: true }, { erro: true })])).toBe(false)
    expect(escalouEmSilencio([])).toBe(false)
  })

  it('turno que fez cadastro/agendamento nunca fica mudo', () => {
    expect(
      escalouEmSilencio([
        { nome: 'cadastrar_tutor', resultado: { id: 1 } },
        transf({ motivo: 'ia_travou', silencioso: true }),
      ]),
    ).toBe(false)
  })
})

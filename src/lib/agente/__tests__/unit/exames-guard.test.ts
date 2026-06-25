import { describe, it, expect } from 'vitest'
import { exameBloqueado, normalizarNome } from '@/lib/agente/exames-guard'

const VALIDOS = ['Ultrassom Abdominal', 'Raio-X', 'Bioquímica', 'Hemogasometria']
const NAO_AGENDAVEIS = ['Bioquímica', 'Hemogasometria']

describe('exameBloqueado', () => {
  it('libera exame válido e não bloqueado', () => {
    expect(exameBloqueado(['Ultrassom Abdominal'], VALIDOS, NAO_AGENDAVEIS)).toBeNull()
    expect(exameBloqueado(['Raio-X'], VALIDOS, NAO_AGENDAVEIS)).toBeNull()
  })

  it('bloqueia exame marcado como não-agendável (mesmo existindo na tabela)', () => {
    expect(exameBloqueado(['Bioquímica'], VALIDOS, NAO_AGENDAVEIS)).toBe('Bioquímica')
  })

  it('bloqueia sub-exame de bioquímica (não existe na tabela principal)', () => {
    expect(exameBloqueado(['TGP (ALT)'], VALIDOS, NAO_AGENDAVEIS)).toBe('TGP (ALT)')
    expect(exameBloqueado(['TGO (AST)'], VALIDOS, NAO_AGENDAVEIS)).toBe('TGO (AST)')
  })

  it('bloqueia nome inventado/inexistente', () => {
    expect(exameBloqueado(['Tomografia'], VALIDOS, NAO_AGENDAVEIS)).toBe('Tomografia')
  })

  it('é insensível a acento e caixa', () => {
    expect(exameBloqueado(['bioquimica'], VALIDOS, NAO_AGENDAVEIS)).toBe('bioquimica')
    expect(exameBloqueado(['ULTRASSOM ABDOMINAL'], VALIDOS, NAO_AGENDAVEIS)).toBeNull()
  })

  it('retorna o primeiro problemático quando há vários exames', () => {
    expect(exameBloqueado(['Ultrassom Abdominal', 'TGP (ALT)'], VALIDOS, NAO_AGENDAVEIS)).toBe('TGP (ALT)')
  })

  it('normalizarNome remove acento e baixa a caixa', () => {
    expect(normalizarNome('Bioquímica')).toBe('bioquimica')
  })
})

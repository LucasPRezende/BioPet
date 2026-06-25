import { describe, it, expect } from 'vitest'
import {
  contarItensRaioX,
  raioXPrecisaAtendente,
  ehRaioXBase,
  ehRaioXAcrescimo,
} from '@/lib/agente/raiox'

const ACR = 'Raio-X Acréscimo por Estudo Adicional'

describe('classificação de Raio-X', () => {
  it('reconhece base vs acréscimo', () => {
    expect(ehRaioXBase('Raio-X')).toBe(true)
    expect(ehRaioXBase('Raio X')).toBe(true)
    expect(ehRaioXBase(ACR)).toBe(false)
    expect(ehRaioXAcrescimo(ACR)).toBe(true)
    expect(ehRaioXAcrescimo('Raio-X Estudo Adicional')).toBe(true)
    expect(ehRaioXBase('Ultrassom Abdominal')).toBe(false)
  })
})

describe('raioXPrecisaAtendente', () => {
  it('UM Raio-X (um estudo, mesmo com projeções na descrição) NÃO precisa atendente', () => {
    const lista = [{ tipo_exame: 'Raio-X', descricao: 'tórax VD e LL' }]
    expect(contarItensRaioX(lista)).toBe(1)
    expect(raioXPrecisaAtendente(lista)).toBe(false)
  })

  it('mais de um item de Raio-X (vários estudos) PRECISA atendente', () => {
    const lista = [
      { tipo_exame: 'Raio-X', descricao: 'tórax' },
      { tipo_exame: 'Raio-X', descricao: 'abdome' },
    ]
    expect(raioXPrecisaAtendente(lista)).toBe(true)
  })

  it('Raio-X base + acréscimo também conta como múltiplo (precisa atendente)', () => {
    const lista = [
      { tipo_exame: 'Raio-X', descricao: 'tórax' },
      { tipo_exame: ACR, descricao: 'abdome' },
    ]
    expect(raioXPrecisaAtendente(lista)).toBe(true)
  })

  it('exames não-Raio-X não disparam a regra', () => {
    const lista = [
      { tipo_exame: 'Ultrassom Abdominal' },
      { tipo_exame: 'Raio-X', descricao: 'tórax' },
    ]
    expect(raioXPrecisaAtendente(lista)).toBe(false)
  })
})

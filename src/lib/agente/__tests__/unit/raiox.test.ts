import { describe, it, expect } from 'vitest'
import { aplicarTravaRaioX, ehRaioXBase, ehRaioXAcrescimo } from '@/lib/agente/raiox'

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

describe('aplicarTravaRaioX', () => {
  it('converte bases excedentes em acréscimo, preservando a posição (descricao)', () => {
    const lista = [
      { tipo_exame: 'Raio-X', descricao: 'tórax LL' },
      { tipo_exame: 'Raio-X', descricao: 'abdome VD' },
      { tipo_exame: 'Raio-X', descricao: 'pelve' },
    ]
    const r = aplicarTravaRaioX(lista, ACR)
    expect(r.map(e => e.tipo_exame)).toEqual(['Raio-X', ACR, ACR])
    // mantém as posições
    expect(r.map(e => e.descricao)).toEqual(['tórax LL', 'abdome VD', 'pelve'])
  })

  it('não altera quando há só um Raio-X base', () => {
    const lista = [
      { tipo_exame: 'Raio-X', descricao: 'tórax' },
      { tipo_exame: ACR, descricao: 'abdome' },
    ]
    expect(aplicarTravaRaioX(lista, ACR)).toEqual(lista)
  })

  it('não altera sem nome de acréscimo', () => {
    const lista = [{ tipo_exame: 'Raio-X' }, { tipo_exame: 'Raio-X' }]
    expect(aplicarTravaRaioX(lista, undefined)).toEqual(lista)
  })

  it('não mexe em exames que não são Raio-X', () => {
    const lista = [
      { tipo_exame: 'Raio-X', descricao: 'tórax' },
      { tipo_exame: 'Ultrassom Abdominal' },
      { tipo_exame: 'Raio-X', descricao: 'abdome' },
    ]
    const r = aplicarTravaRaioX(lista, ACR)
    expect(r.map(e => e.tipo_exame)).toEqual(['Raio-X', 'Ultrassom Abdominal', ACR])
  })
})

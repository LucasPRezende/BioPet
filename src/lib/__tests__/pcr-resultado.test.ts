import { describe, it, expect } from 'vitest'
import { classificarCt, parseCt, casarAlvo, palavrasChave } from '../pcr-resultado'

describe('classificarCt (tabela do relatório Bioguard)', () => {
  it('Ct 0 é negativo', () => {
    expect(classificarCt(0)).toBe('neg')
  })

  it('respeita os limites de cada faixa', () => {
    expect(classificarCt(0.1)).toBe('invalido')
    expect(classificarCt(10)).toBe('invalido')
    expect(classificarCt(10.01)).toBe('pos_forte')
    expect(classificarCt(20)).toBe('pos_forte')
    expect(classificarCt(20.5)).toBe('pos')
    expect(classificarCt(30)).toBe('pos')
    expect(classificarCt(35.99)).toBe('pos_fraco')
    expect(classificarCt(36)).toBe('limitrofe')
    expect(classificarCt(40)).toBe('limitrofe')
  })

  it('fora da tabela ou sem valor não classifica', () => {
    expect(classificarCt(40.1)).toBeNull()
    expect(classificarCt(-1)).toBeNull()
    expect(classificarCt(null)).toBeNull()
    expect(classificarCt(undefined)).toBeNull()
    expect(classificarCt(NaN)).toBeNull()
  })
})

describe('parseCt', () => {
  it('aceita vírgula e ponto', () => {
    expect(parseCt('12,5')).toBe(12.5)
    expect(parseCt('12.5')).toBe(12.5)
    expect(parseCt(' 0 ')).toBe(0)
    expect(parseCt(33)).toBe(33)
  })
  it('vazio ou lixo vira null', () => {
    expect(parseCt('')).toBeNull()
    expect(parseCt('abc')).toBeNull()
    expect(parseCt(null)).toBeNull()
  })
})

describe('casarAlvo', () => {
  const catalogo = [
    { id: 1, nome: 'Mycoplasma felis',                 analitos: null },
    { id: 2, nome: 'FIV',                              analitos: null },
    { id: 3, nome: 'Leucemia Felina (FeLV)',           analitos: null },
    { id: 4, nome: 'FIV e FeLV',                       analitos: ['FIV', 'FeLV'] },
    { id: 8, nome: 'Leishmania spp.',                  analitos: null },
    { id: 9, nome: 'Anaplasma platys',                 analitos: null },
    { id: 11, nome: 'Doenças do Carrapato (4 agentes)', analitos: ['Ehrlichia canis', 'Anaplasma platys', 'Babesia vogeli', 'Hepatozoon canis'] },
  ]

  it('ignora "spp", caixa e pontuação', () => {
    expect(palavrasChave('Leishmania spp')).toEqual(['leishmania'])
    expect(casarAlvo('Leishmania spp', catalogo)?.id).toBe(8)
    expect(casarAlvo('LEISHMANIA SPP.', catalogo)?.id).toBe(8)
  })

  it('acha pela sigla entre parênteses', () => {
    expect(casarAlvo('FeLV', catalogo)?.id).toBe(3)
  })

  it('prefere o PCR que está no agendamento', () => {
    expect(casarAlvo('FeLV', catalogo, [4])?.id).toBe(4)
    expect(casarAlvo('Anaplasma platys', catalogo, [11])?.id).toBe(11)
  })

  it('sem agendamento, o nome exato ganha do painel', () => {
    expect(casarAlvo('Anaplasma platys', catalogo)?.id).toBe(9)
  })

  it('nada parecido → null', () => {
    expect(casarAlvo('Parvovirus', catalogo)).toBeNull()
    expect(casarAlvo('', catalogo)).toBeNull()
  })
})

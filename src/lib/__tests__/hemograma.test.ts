import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { parseHemogramaCsv, montarLinhasHemograma, statusValor, formatarValor } from '../hemograma'

const CSV = fs.readFileSync(path.join(__dirname, 'fixtures', 'hemograma-analisador.csv'), 'utf-8')

describe('parseHemogramaCsv', () => {
  it('lê o arquivo exportado pelo analisador (separador ;)', () => {
    const [a, ...resto] = parseHemogramaCsv(CSV)
    expect(resto).toHaveLength(0)
    expect(a.paciente).toBe('pirulito')        // veio em "No. Amostra", Paciente vazio
    expect(a.animal).toBe('Cachorro')
    expect(a.idade).toBe('')
    expect(a.data_hora).toBe('15/10/2026 15:18')
    expect(a.data_iso).toBe('2026-10-15')
    expect(a.valores).toMatchObject({
      LEU: '11.14', HEM: '5.89', HGB: '16.5', HCT: '39.5', VCM: '67.1', HCM: '28.0',
      CHCM: '41.7', RDW: '17.4', PLQ: '384', VPM: '9.7',
      NEU_REL: '59.24', NEU_ABS: '6.601', LIN_REL: '20.62', LIN_ABS: '2.297',
      MON_REL: '7.98', EOS_REL: '11.88', BASO_ABS: '0.031',
    })
  })

  it('aceita o mesmo arquivo com vírgula como separador (padrão da máquina)', () => {
    const comVirgula = CSV.split(/\r?\n/).map(l => l.replace(/;/g, ',')).join('\n')
    const [a] = parseHemogramaCsv(comVirgula)
    expect(a.paciente).toBe('pirulito')
    expect(a.valores.LEU).toBe('11.14')
    expect(a.valores.PLQ).toBe('384')
    expect(a.valores.NEU_ABS).toBe('6.601')
  })

  it('respeita campos entre aspas duplas com vírgula dentro', () => {
    const csv = 'ID,Paciente,LEU,HEM,HGB,HCT,PLQ\n1,"Rex, o bravo",10.5,6.1,14.0,42.0,300\n'
    const [a] = parseHemogramaCsv(csv)
    expect(a.paciente).toBe('Rex, o bravo')
    expect(a.valores.PLQ).toBe('300')
  })

  it('recusa arquivo que não é do analisador', () => {
    expect(() => parseHemogramaCsv('nome;valor\nx;1\n')).toThrow(/não parece ser/)
  })
})

describe('montarLinhasHemograma', () => {
  it('junta relativo e absoluto e marca status pelo absoluto', () => {
    const [a] = parseHemogramaCsv(CSV)
    const g = montarLinhasHemograma(a.valores, [
      { parametro: 'EOS_REL', valor_min: 2, valor_max: 10 },
      { parametro: 'EOS_ABS', valor_min: 0.1, valor_max: 1.25 },
      { parametro: 'HCM', valor_min: 19.5, valor_max: 24.5 },
    ])
    const eos = g.leucograma.find(l => l.tipo === 'diferencial' && l.celula === 'EOS')
    expect(eos).toMatchObject({ relativo: '11.88', absoluto: '1.323', status: 'H' })
    expect(g.eritrograma.find(l => l.tipo === 'simples' && l.codigo === 'HCM')?.status).toBe('H')
    expect(g.plaquetograma.map(l => l.tipo === 'simples' && l.codigo)).toEqual(['PLQ', 'VPM'])
  })

  it('statusValor e formatarValor', () => {
    expect(statusValor('5', { parametro: 'X', valor_min: 6, valor_max: 17 })).toBe('L')
    expect(statusValor('5', undefined)).toBe('')
    expect(formatarValor('6.601', 2)).toBe('6,60')
    expect(formatarValor('384', 0)).toBe('384')
  })
})

import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { parseHemogramaCsv, montarLinhasHemograma, statusValor, formatarValor, normalizarIdade, normalizarSexo, exameHemogramaDe } from '../hemograma'

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
    // nunca menos casas do que o valor trouxe; completa até as casas do parâmetro
    expect(formatarValor('6.601', 2)).toBe('6,601')
    expect(formatarValor('81.13', 1)).toBe('81,13')
    expect(formatarValor('81', 2)).toBe('81,00')
    expect(formatarValor('384', 0)).toBe('384')
  })
})

describe('arquivo real com vírgula (paciente Maya)', () => {
  const CSV_VIRGULA = fs.readFileSync(path.join(__dirname, 'fixtures', 'hemograma-analisador-virgula.csv'), 'utf-8')

  it('lê paciente, tutor, sexo e idade normalizados', () => {
    const [a] = parseHemogramaCsv(CSV_VIRGULA)
    expect(a).toMatchObject({
      paciente: 'Maya', proprietario: 'Natalia', animal: 'Cachorro',
      sexo: 'Fêmea', idade: '2 anos', data_iso: '2026-10-16',
    })
    expect(a.valores).toMatchObject({ LEU: '10.16', NEU_REL: '81.92', PLQ: '358', HCT: '37.2' })
    // modo sem reticulócitos: não vêm
    expect(a.valores.RETIC).toBeUndefined()
  })
})

describe('reticulócitos e normalizações', () => {
  it('lê RETIC/RETIC_ABS quando vêm e mostra no eritrograma', () => {
    const csv = 'ID,Animal,LEU,HEM,HGB,HCT,PLQ,RETIC,RETIC_ABS\n1,Cachorro,10,6,14,40,300,3.10,186.0\n'
    const [a] = parseHemogramaCsv(csv)
    expect(a.valores).toMatchObject({ RETIC: '3.10', RETIC_ABS: '186.0' })
    const g = montarLinhasHemograma(a.valores, [{ parametro: 'RETIC', valor_min: 0, valor_max: 2.5 }])
    const ret = g.eritrograma.find(l => l.tipo === 'simples' && l.codigo === 'RETIC')
    expect(ret?.status).toBe('H')
    const abs = g.eritrograma.find(l => l.tipo === 'simples' && l.codigo === 'RETIC_ABS')
    expect(abs).toMatchObject({ valor: '186.0', unidade: '10³/µL' })
    expect(g.eritrograma.map(l => l.tipo === 'simples' && l.codigo).slice(-2)).toEqual(['RETIC', 'RETIC_ABS'])
  })

  it('normalizarIdade e normalizarSexo', () => {
    expect(normalizarIdade('2 Y')).toBe('2 anos')
    expect(normalizarIdade('1 Y')).toBe('1 ano')
    expect(normalizarIdade('6 M')).toBe('6 meses')
    expect(normalizarIdade('10 D')).toBe('10 dias')
    expect(normalizarIdade('3 anos')).toBe('3 anos')
    expect(normalizarIdade('')).toBe('')
    expect(normalizarSexo('Fêmea')).toBe('Fêmea')
    expect(normalizarSexo('Male')).toBe('Macho')
    expect(normalizarSexo('')).toBe('')
  })
})

describe('caso Nina (16/10): relativo alto com absoluto normal', () => {
  it('marca o neutrófilo como Alto pelo relativo, igual à máquina', () => {
    const g = montarLinhasHemograma({ LEU: '11.15', NEU_REL: '81.13', NEU_ABS: '9.048' }, [
      { parametro: 'NEU_REL', valor_min: 52, valor_max: 81 },
      { parametro: 'NEU_ABS', valor_min: 3.62, valor_max: 11.32 },
    ])
    const neu = g.leucograma.find(l => l.tipo === 'diferencial' && l.celula === 'NEU')
    expect(neu).toMatchObject({ status_rel: 'H', status_abs: 'N', status: 'H' })
  })
})

describe('modo "Teste Retic." (paciente Paçoca)', () => {
  const CSV_RETIC = fs.readFileSync(path.join(__dirname, 'fixtures', 'hemograma-analisador-retic.csv'), 'utf-8')

  it('lê os reticulócitos marcados com "*" e informa a marca', () => {
    const [a] = parseHemogramaCsv(CSV_RETIC)
    expect(a).toMatchObject({ paciente: 'Paçoca', modo: 'Teste Retic.', idade: '9 anos', sexo: 'Fêmea' })
    expect(a.valores).toEqual({ HEM: '3.04', RETIC: '0.26', RETIC_ABS: '7', IRF: '8.33' })
    expect(a.marcados).toEqual(['RETIC', 'RETIC_ABS', 'IRF'])
    // IRF sai no eritrograma logo depois dos reticulócitos, sem referência
    const g = montarLinhasHemograma(a.valores, [])
    expect(g.eritrograma.map(l => l.tipo === 'simples' && l.codigo)).toEqual(['HEM', 'RETIC', 'RETIC_ABS', 'IRF'])
  })
})

describe('exameHemogramaDe', () => {
  it('classifica pelo nome cadastrado, sem ligar para caixa e acento', () => {
    expect(exameHemogramaDe('HEMOGRAMA')).toBe('hemograma')
    expect(exameHemogramaDe('Hemograma')).toBe('hemograma')
    expect(exameHemogramaDe('RETICULÓCITOS')).toBe('reticulocitos')
    expect(exameHemogramaDe('Reticulocitos')).toBe('reticulocitos')
    expect(exameHemogramaDe('Hemogasometria')).toBeNull()
    expect(exameHemogramaDe(null)).toBeNull()
  })
})

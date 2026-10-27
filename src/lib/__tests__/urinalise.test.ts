import { describe, it, expect } from 'vitest'
import {
  lerValorUrina, statusUrina, textoReferencia, montarLinhasUrina, parametrosDaFita, parametrosFaltando,
  fitaDoExame, codigoDaSigla, notasAutomaticas, linhasManuais, CAMPOS_FISICO, itensParaValores, validarUrinalise,
  type ReferenciaUrina,
} from '../urinalise'

const ref = (parametro: string, valor_min: number | null, valor_max: number | null): ReferenciaUrina =>
  ({ parametro, valor_min, valor_max })

describe('fitaDoExame', () => {
  it('reconhece o tipo de fita pelo nome do exame', () => {
    expect(fitaDoExame('Urinálise (11 parâmetros)')).toBe(11)
    expect(fitaDoExame('Urinálise (14 parâmetros)')).toBe(14)
    expect(fitaDoExame('URINALISE 14')).toBe(14)
    expect(fitaDoExame('Urina tipo I')).toBe(11)
    expect(fitaDoExame('Hemograma')).toBeNull()
    expect(fitaDoExame(null)).toBeNull()
  })
})

describe('parametrosDaFita', () => {
  it('11G tem 11 parâmetros; 14G tem 14 + a relação albumina/creatinina que a máquina calcula', () => {
    expect(parametrosDaFita(11).map(p => p.codigo)).toEqual(['LEU', 'KET', 'NIT', 'URO', 'BIL', 'GLU', 'PRO', 'SG', 'PH', 'BLD', 'VC'])
    expect(parametrosDaFita(14)).toHaveLength(15)
    expect(parametrosDaFita(14).map(p => p.codigo)).toEqual(expect.arrayContaining(['MA', 'CA', 'CR', 'ACR']))
  })
})

describe('codigoDaSigla', () => {
  it('mapeia as siglas da máquina', () => {
    expect(codigoDaSigla('pH')).toBe('PH')
    expect(codigoDaSigla('Vc')).toBe('VC')
    expect(codigoDaSigla('*BIL')).toBe('BIL')
    expect(codigoDaSigla('Ca')).toBe('CA')
    expect(codigoDaSigla('XYZ')).toBeNull()
  })
})

describe('lerValorUrina', () => {
  it('qualitativos e "Normal" viram número para comparar', () => {
    expect(lerValorUrina('Neg', 'NIT')).toEqual({ numero: 0, comparador: '=', texto: 'Negativo' })
    expect(lerValorUrina('Pos', 'NIT')).toEqual({ numero: 1, comparador: '=', texto: 'Positivo' })
    expect(lerValorUrina('Normal', 'URO')).toMatchObject({ numero: 0, texto: 'Normal' })
  })

  it('descarta a unidade impressa e formata em pt-BR', () => {
    expect(lerValorUrina('0.5 mg/dL', 'BIL')).toMatchObject({ numero: 0.5, texto: '0,5' })
    expect(lerValorUrina('0 leu/uL', 'LEU')).toMatchObject({ numero: 0, texto: '0' })
    expect(lerValorUrina('1.015', 'SG')).toMatchObject({ numero: 1.015, texto: '1,015' })
    expect(lerValorUrina('1.02', 'SG')).toMatchObject({ numero: 1.02, texto: '1,020' })
    expect(lerValorUrina('5.5', 'PH')).toMatchObject({ numero: 5.5, texto: '5,5' })
  })

  it('mantém o comparador da máquina ("<=1", "<30")', () => {
    expect(lerValorUrina('<=1 mg/dL', 'MA')).toMatchObject({ numero: 1, comparador: '<=', texto: '≤ 1' })
    expect(lerValorUrina('<30 mg/g', 'ACR')).toMatchObject({ numero: 30, comparador: '<', texto: '< 30' })
  })

  it('ignora o asterisco de marcação da impressão', () => {
    expect(lerValorUrina('*0.5', 'BIL')).toMatchObject({ numero: 0.5 })
  })

  it('texto que não dá para interpretar fica como veio, sem número', () => {
    expect(lerValorUrina('ilegível', 'GLU')).toEqual({ numero: null, comparador: '=', texto: 'ilegível' })
  })
})

describe('statusUrina', () => {
  it('acima do máximo é alterado; zero com máximo zero é normal', () => {
    expect(statusUrina(lerValorUrina('100', 'PRO'), ref('PRO', null, 30))).toBe('A')
    expect(statusUrina(lerValorUrina('0', 'GLU'), ref('GLU', null, 0))).toBe('N')
    expect(statusUrina(lerValorUrina('Pos', 'NIT'), ref('NIT', null, 0))).toBe('A')
  })

  it('densidade e pH usam mínimo e máximo', () => {
    expect(statusUrina(lerValorUrina('1.010', 'SG'), ref('SG', 1.015, 1.045))).toBe('B')
    expect(statusUrina(lerValorUrina('1.025', 'SG'), ref('SG', 1.015, 1.045))).toBe('N')
    expect(statusUrina(lerValorUrina('8.0', 'PH'), ref('PH', 5.5, 7.5))).toBe('A')
  })

  it('"<=1" com máximo 1 está dentro; ">300" com máximo 300 está acima', () => {
    expect(statusUrina(lerValorUrina('<=1', 'MA'), ref('MA', null, 1))).toBe('N')
    expect(statusUrina(lerValorUrina('>300', 'ACR'), ref('ACR', null, 300))).toBe('A')
  })

  it('sem referência ou sem número não tem status', () => {
    expect(statusUrina(lerValorUrina('100', 'VC'), undefined)).toBe('')
    expect(statusUrina(lerValorUrina('100', 'VC'), ref('VC', null, null))).toBe('')
    expect(statusUrina(lerValorUrina('ilegível', 'GLU'), ref('GLU', null, 0))).toBe('')
  })
})

describe('textoReferencia', () => {
  it('formata a faixa como sai no laudo', () => {
    expect(textoReferencia(ref('GLU', null, 0), 'GLU')).toBe('Negativo')
    expect(textoReferencia(ref('BIL', null, 1), 'BIL')).toBe('até 1')
    expect(textoReferencia(ref('SG', 1.015, 1.045), 'SG')).toBe('1,015 – 1,045')
    expect(textoReferencia(ref('PH', 5.5, 7.5), 'PH')).toBe('5,5 – 7,5')
    expect(textoReferencia(ref('PH', 6, 7.5), 'PH')).toBe('6,0 – 7,5')
    expect(textoReferencia(undefined, 'CA')).toBe('—')
  })
})

describe('montarLinhasUrina', () => {
  it('monta na ordem da fita, pula vazios e tira a unidade de resultado qualitativo', () => {
    const linhas = montarLinhasUrina(
      { PRO: '100', NIT: 'Neg', BIL: '6.0', URO: 'Normal', SG: '1.025', CA: '' },
      [ref('PRO', null, 30), ref('NIT', null, 0), ref('BIL', null, 1), ref('URO', null, 1)],
    )
    expect(linhas.map(l => l.codigo)).toEqual(['NIT', 'URO', 'BIL', 'PRO', 'SG'])
    expect(linhas.find(l => l.codigo === 'PRO')).toMatchObject({ texto: '100', unidade: 'mg/dL', status: 'A' })
    expect(linhas.find(l => l.codigo === 'URO')).toMatchObject({ texto: 'Normal', unidade: '', status: 'N' })
    expect(linhas.find(l => l.codigo === 'BIL')).toMatchObject({ texto: '6,0', status: 'A' })
    expect(linhas.find(l => l.codigo === 'SG')).toMatchObject({ referencia: '—', status: '' })
  })
})

describe('parametrosFaltando', () => {
  it('aponta o que a foto não pegou (14G com só a primeira tela), sem cobrar a ACR', () => {
    const tela1 = { LEU: '0', KET: '0', NIT: 'Neg', URO: '2.0', BIL: '6.0', PRO: '100', GLU: '0', SG: '1.025', BLD: '0.6', PH: '5.5', VC: '100' }
    expect(parametrosFaltando(11, tela1)).toEqual([])
    expect(parametrosFaltando(14, tela1).map(p => p.codigo)).toEqual(['MA', 'CA', 'CR'])
  })
})

describe('notasAutomaticas', () => {
  it('avisa interferência quando há ácido ascórbico', () => {
    expect(notasAutomaticas({ VC: '100' })).toHaveLength(1)
    expect(notasAutomaticas({ VC: '0' })).toEqual([])
    expect(notasAutomaticas({})).toEqual([])
  })
})

describe('linhasManuais', () => {
  it('só os campos preenchidos, com a referência fixa', () => {
    const l = linhasManuais(CAMPOS_FISICO, { cor: 'Amarelo citrino', aspecto: ' ', coleta: 'Cistocentese' })
    expect(l).toEqual([
      { nome: 'Método de coleta', valor: 'Cistocentese', referencia: '' },
      { nome: 'Cor', valor: 'Amarelo citrino', referencia: 'Amarelo citrino a âmbar' },
    ])
  })
})

describe('itensParaValores', () => {
  it('junta as duas fotos da tela, ignora sigla repetida e separa o que não é da fita', () => {
    const r = itensParaValores([
      { sigla: 'LEU', valor: '0' }, { sigla: 'pH', valor: '5.5' }, { sigla: 'Vc', valor: '100' },
      { sigla: 'pH', valor: '6.0' },           // mesma tela fotografada de novo
      { sigla: 'MA', valor: '' }, { sigla: 'MA', valor: '<=1' },
      { sigla: 'HORA', valor: '10:47' },
    ])
    expect(r.valores).toEqual({ LEU: '0', PH: '5.5', VC: '100', MA: '<=1' })
    expect(r.desconhecidos).toEqual(['HORA'])
  })
})

describe('validarUrinalise', () => {
  const ok = { nome_pet: 'Thor', especie: 'Canina', fita: 11, valores: { LEU: '0', PH: '6.0' } }
  it('aceita o laudo completo', () => {
    expect(validarUrinalise(ok)).toBe('')
    expect(validarUrinalise({ ...ok, fita: 14, valores: { MA: '<=1', CR: '200' } })).toBe('')
  })
  it('exige paciente, espécie e ao menos um resultado', () => {
    expect(validarUrinalise({ ...ok, nome_pet: ' ' })).toMatch(/paciente/)
    expect(validarUrinalise({ ...ok, especie: '' })).toMatch(/espécie/)
    expect(validarUrinalise({ ...ok, valores: { LEU: ' ' } })).toMatch(/Nenhum resultado/)
  })
  it('recusa fita 11 com parâmetro que só a 14 tem', () => {
    expect(validarUrinalise({ ...ok, valores: { LEU: '0', MA: '<=1', CA: '20' } })).toMatch(/MA, CA/)
  })
  it('recusa tipo de fita e parâmetro desconhecidos', () => {
    expect(validarUrinalise({ ...ok, fita: 12 })).toMatch(/fita/)
    expect(validarUrinalise({ ...ok, valores: { XYZ: '1' } })).toMatch(/XYZ/)
  })
})

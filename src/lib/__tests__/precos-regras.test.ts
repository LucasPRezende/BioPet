import { describe, it, expect } from 'vitest'
import { combinacoesZeradas, explicarVazio, podeAtivar, parseValorBR, valorEfetivo } from '@/lib/precos-regras'
import { diffHistorico } from '@/lib/historico-precos'

const linha = (o: Partial<{
  varia_por_horario: boolean
  preco_pix_comercial: number | null; preco_cartao_comercial: number | null
  preco_pix_fora_horario: number | null; preco_cartao_fora_horario: number | null
}>) => ({
  varia_por_horario: false,
  preco_pix_comercial: null, preco_cartao_comercial: null,
  preco_pix_fora_horario: null, preco_cartao_fora_horario: null,
  ...o,
})

describe('valor efetivo (regra 1.1 = precoExame)', () => {
  it('não varia: cartão vazio usa o Pix', () => {
    const r = linha({ preco_pix_comercial: 320 })
    expect(valorEfetivo(r, 'preco_cartao_comercial')).toBe(320)
    expect(combinacoesZeradas(r)).toEqual([])
    expect(explicarVazio(r, 'preco_cartao_comercial')).toMatchObject({ valor: 320, zero: false })
  })

  it('varia: cartão comercial vazio cobra zero (não usa o Pix)', () => {
    const r = linha({ varia_por_horario: true, preco_pix_comercial: 180, preco_pix_fora_horario: 240, preco_cartao_fora_horario: 260 })
    expect(valorEfetivo(r, 'preco_cartao_comercial')).toBe(0)
    expect(combinacoesZeradas(r).map(c => c.rotulo)).toEqual(['Cartão comercial'])
    expect(explicarVazio(r, 'preco_cartao_comercial')).toMatchObject({ zero: true })
  })

  it('varia: fora do horário vazio usa o comercial', () => {
    const r = linha({ varia_por_horario: true, preco_pix_comercial: 180, preco_cartao_comercial: 200 })
    expect(valorEfetivo(r, 'preco_pix_fora_horario')).toBe(180)
    expect(valorEfetivo(r, 'preco_cartao_fora_horario')).toBe(200)
    expect(combinacoesZeradas(r)).toEqual([])
  })

  it('campo com valor não tem explicação de vazio', () => {
    expect(explicarVazio(linha({ preco_pix_comercial: 50 }), 'preco_pix_comercial')).toBeNull()
  })
})

describe('podeAtivar', () => {
  it('exame precisa de Pix comercial > 0', () => {
    expect(podeAtivar({ tipo_exame: 'Raio-X', preco_pix_comercial: 230 })).toBe(true)
    expect(podeAtivar({ tipo_exame: 'Novo', preco_pix_comercial: null })).toBe(false)
    expect(podeAtivar({ tipo_exame: 'Novo', preco_pix_comercial: 0 })).toBe(false)
  })
  it('agrupador não precisa (preço é por sub-exame)', () => {
    expect(podeAtivar({ tipo_exame: 'Bioquímica', preco_pix_comercial: null })).toBe(true)
  })
})

describe('parseValorBR', () => {
  it.each([
    ['280', 280], ['280,50', 280.5], ['1.280,50', 1280.5], ['R$ 280', 280],
    ['1.280', 1280], ['1280.5', 1280.5], ['  12,3 ', 12.3],
  ])('%s → %s', (t, n) => expect(parseValorBR(t)).toBe(n))

  it('vazio → null', () => expect(parseValorBR('  ')).toBeNull())
  it.each(['abc', '12,3,4', '-5', '1..2'])('inválido: %s', t => expect(parseValorBR(t)).toBeNaN())
})

describe('diffHistorico', () => {
  it('só os campos que mudaram', () => {
    const d = diffHistorico('comissoes_exame', 7,
      { preco_pix_comercial: 80, comissao_clinica: 0, observacao: null, ativo: true },
      { preco_pix_comercial: 90, comissao_clinica: 0, observacao: null, ativo: false })
    expect(d).toEqual([
      { tabela: 'comissoes_exame', registro_id: 7, campo: 'preco_pix_comercial', antes: 80, depois: 90 },
      { tabela: 'comissoes_exame', registro_id: 7, campo: 'ativo', antes: true, depois: false },
    ])
  })
})

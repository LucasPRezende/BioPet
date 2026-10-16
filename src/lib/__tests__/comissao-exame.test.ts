import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  geraComissaoClinica, algumGeraComissaoClinica, tiposComExtracao, comissaoExtracaoDe,
  type ComissoesDoExame,
} from '@/lib/comissao-exame'

const tabela: ComissoesDoExame[] = [
  { tipo_exame: 'Raio-X',          comissao_laudo: 30, comissao_clinica: 0,  comissao_extracao: 0 },
  { tipo_exame: 'Hemograma',       comissao_laudo: 0,  comissao_clinica: 30, comissao_extracao: 0 },
  { tipo_exame: 'Hemogasometria',  comissao_laudo: 0,  comissao_clinica: 0,  comissao_extracao: 15 },
  // exame hipotético que paga clínica E extrator
  { tipo_exame: 'Perfil Completo', comissao_laudo: 0,  comissao_clinica: 20, comissao_extracao: 10 },
  { tipo_exame: 'Bioquímica',      comissao_laudo: 0,  comissao_clinica: 0,  comissao_extracao: 0 },
  { tipo_exame: 'Teste Rápido',    comissao_laudo: 0,  comissao_clinica: 0,  comissao_extracao: 0 },
]

describe('comissão da clínica', () => {
  it('Hemograma gera, Raio-X não', () => {
    expect(geraComissaoClinica('Hemograma', tabela)).toBe(true)
    expect(geraComissaoClinica('Raio-X', tabela)).toBe(false)
  })

  it('Bioquímica e Teste Rápido sempre geram (valor está nos sub-exames)', () => {
    expect(geraComissaoClinica('Bioquímica', tabela)).toBe(true)
    expect(geraComissaoClinica('Teste Rápido', tabela)).toBe(true)
  })

  it('exame fora da tabela não gera', () => {
    expect(geraComissaoClinica('Endoscopia', tabela)).toBe(false)
  })

  it('pergunta a clínica se qualquer exame do agendamento gera', () => {
    expect(algumGeraComissaoClinica(['Raio-X', 'Hemograma'], tabela)).toBe(true)
    expect(algumGeraComissaoClinica(['Raio-X', 'Hemogasometria'], tabela)).toBe(false)
  })
})

describe('comissão de extração', () => {
  it('lista os exames que pagam o extrator', () => {
    expect(tiposComExtracao(tabela).sort()).toEqual(['Hemogasometria', 'Perfil Completo'])
  })

  it('soma a comissão dos exames do agendamento', () => {
    expect(comissaoExtracaoDe(['Hemogasometria', 'Raio-X'], tabela)).toBe(15)
    expect(comissaoExtracaoDe(['Hemogasometria', 'Perfil Completo'], tabela)).toBe(25)
  })

  it('exame com clínica e extrator paga os dois', () => {
    expect(geraComissaoClinica('Perfil Completo', tabela)).toBe(true)
    expect(comissaoExtracaoDe(['Perfil Completo'], tabela)).toBe(10)
  })
})

// ── precificarExames: comissão da clínica em exame simples ───────────────────

const comissoesExame = [
  { tipo_exame: 'Hemograma', varia_por_horario: false, preco_pix_comercial: 50, preco_cartao_comercial: 55,
    preco_pix_fora_horario: 50, preco_cartao_fora_horario: 55, comissao_clinica: 30 },
  { tipo_exame: 'Raio-X', varia_por_horario: false, preco_pix_comercial: 230, preco_cartao_comercial: 250,
    preco_pix_fora_horario: 230, preco_cartao_fora_horario: 250, comissao_clinica: 0 },
]

vi.mock('@/lib/supabase', () => {
  const builder = (tabela: string) => {
    const linhas = tabela === 'comissoes_exame' ? comissoesExame : []
    const b: Record<string, unknown> = {}
    b.select = () => b
    b.in = () => b
    b.then = (res: (v: unknown) => void) => res({ data: linhas, error: null })
    return b
  }
  return { supabase: { from: (t: string) => builder(t) } }
})
vi.mock('@/lib/mp-preference', () => ({ gerarPreferenciaMp: async () => {}, expirarPreferenciaMp: async () => {} }))

describe('precificarExames', () => {
  let precificarExames: typeof import('@/lib/agendamento-helpers').precificarExames
  beforeEach(async () => {
    ({ precificarExames } = await import('@/lib/agendamento-helpers'))
  })

  const base = { forma: 'pix' as const, gratuito: false, bio: [], dataHora: '2026-10-20T10:00:00', encaixe: false }
  const exames = [
    { tipo_exame: 'Hemograma', duracao_minutos: 10, valor: 0 },
    { tipo_exame: 'Raio-X',    duracao_minutos: 30, valor: 0 },
  ]

  it('tutor paga: preço cheio, comissão gravada na linha', async () => {
    const r = await precificarExames(exames, base)
    expect(r[0]).toMatchObject({ tipo_exame: 'Hemograma', valor: 50, comissao_clinica: 30 })
    expect(r[1]).toMatchObject({ tipo_exame: 'Raio-X', valor: 230, comissao_clinica: 0 })
  })

  it('clínica paga: comissão sai do repasse, igual ao Teste Rápido', async () => {
    const r = await precificarExames(exames, { ...base, pagamentoClinica: true })
    expect(r[0]).toMatchObject({ tipo_exame: 'Hemograma', valor: 20, comissao_clinica: 30 })
    expect(r[1]).toMatchObject({ tipo_exame: 'Raio-X', valor: 230 })
  })

  it('gratuito: sem valor e sem comissão', async () => {
    const r = await precificarExames(exames, { ...base, gratuito: true })
    expect(r[0]).toMatchObject({ valor: 0, comissao_clinica: 0 })
  })
})

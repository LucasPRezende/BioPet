import { describe, it, expect } from 'vitest'
import { vetCasaComNome } from '@/lib/agente/veterinario-nome'

describe('vetCasaComNome — o id escolhido é mesmo quem o cliente citou?', () => {
  it('nome parcial/apelido do cliente casa com o nome completo do cadastro', () => {
    expect(vetCasaComNome('YVES DE ALMEIDA ROQUE', 'Dr. Yves')).toBe(true)
    expect(vetCasaComNome('THAYNARA', 'Dra. Thaynara de Mello dos Santos')).toBe(true)
  })

  it('ignora acento, maiúscula e título', () => {
    expect(vetCasaComNome('JÉSSICA RODRIGUES DA SILVA', 'dra jessica rodrigues')).toBe(true)
  })

  it('outra pessoa NÃO casa (caso 817: Yves virou o id da Andreza)', () => {
    expect(vetCasaComNome('ANDREZA CARVALHO', 'Dr. Yves')).toBe(false)
  })

  it('só título/ligação no nome citado não casa com nada', () => {
    expect(vetCasaComNome('YVES DE ALMEIDA ROQUE', 'Dr. de')).toBe(false)
    expect(vetCasaComNome('YVES DE ALMEIDA ROQUE', '')).toBe(false)
  })
})

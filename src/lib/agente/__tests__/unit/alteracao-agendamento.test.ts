import { describe, it, expect } from 'vitest'
import { descreverAlteracao } from '@/lib/agente/alteracao-agendamento'

const base = {
  dataHoraAntes: '2026-10-28T09:30:00',
  dataHoraDepois: '2026-10-28T09:30:00',
}

describe('descreverAlteracao — notificação de alteração feita pela IA', () => {
  it('data/hora mudou → remarcação, com o de/para', () => {
    const r = descreverAlteracao({ ...base, dataHoraDepois: '2026-11-04T09:30:00' })
    expect(r.tipoEvento).toBe('remarcacao')
    expect(r.descricao).toContain('28/10 às 09:30 → 04/11 às 09:30')
  })

  it('só trocou veterinário → alteração (NÃO remarcação), sem falar de data', () => {
    const r = descreverAlteracao({ ...base, veterinarioMudou: true })
    expect(r.tipoEvento).toBe('alteracao')
    expect(r.descricao).toBe('Veterinário trocado')
  })

  it('só trocou a forma de pagamento → alteração com pagamento e valor', () => {
    const r = descreverAlteracao({
      ...base,
      formaPagamentoAntes: 'pix', formaPagamentoDepois: 'cartao',
      valorAntes: 180, valorDepois: 200,
    })
    expect(r.tipoEvento).toBe('alteracao')
    expect(r.descricao).toContain('Pagamento: PIX → cartão')
    expect(r.descricao).toContain('Valor: R$ 180,00 → R$ 200,00')
  })

  it('observação acrescentada entra na descrição', () => {
    const r = descreverAlteracao({ ...base, observacaoAdicionada: true })
    expect(r.tipoEvento).toBe('alteracao')
    expect(r.descricao).toBe('Observação acrescentada')
  })

  it('sem nenhuma diferença detectável ainda devolve texto', () => {
    expect(descreverAlteracao(base).descricao).toBe('Agendamento alterado pela IA')
  })
})

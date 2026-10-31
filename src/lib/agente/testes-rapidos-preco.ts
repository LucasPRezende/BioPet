/**
 * Testes rápidos como a IA enxerga na tabela de preços. Teste sem valor
 * cadastrado (preço 0, ex.: Leptospirose) não vira "R$ 0": a IA diz que a
 * equipe informa o valor.
 */
export function montarTestesRapidos(
  linhas: { nome: string; preco_pix: number | null; preco_cartao: number | null }[],
) {
  return linhas.map(t => {
    const definido = Number(t.preco_pix ?? 0) > 0
    return definido
      ? { nome: t.nome, valor_definido: true, pix: Number(t.preco_pix), cartao_total: Number(t.preco_cartao ?? t.preco_pix) }
      : { nome: t.nome, valor_definido: false }
  })
}

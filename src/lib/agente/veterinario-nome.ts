/**
 * Confere se o veterinario_id que a IA escolheu é mesmo o veterinário que o
 * cliente citou. A IA já pegou o id de OUTRA pessoa (caso 817, 28/10/2026: o
 * Dr. Yves virou o id 8, que era a Andreza) — a regra de prompt "não chute id"
 * não bastou, então o backend confere o nome.
 */

const TITULOS_E_LIGACOES = new Set([
  'dr', 'dra', 'doutor', 'doutora', 'vet', 'veterinario', 'veterinaria', 'prof', 'profa',
  'de', 'da', 'do', 'dos', 'das', 'e',
])

function palavras(nome: string): string[] {
  return nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((p) => p.length >= 2 && !TITULOS_E_LIGACOES.has(p))
}

/**
 * True se pelo menos uma palavra relevante do nome citado aparece no nome do
 * cadastro (ignora acento, maiúscula, "Dr./Dra." e "de/da/do"). Apelido ou nome
 * parcial passam ("Yves" casa com "YVES DE ALMEIDA ROQUE"); outra pessoa não.
 */
export function vetCasaComNome(nomeNoCadastro: string, nomeCitado: string): boolean {
  const cadastro = palavras(nomeNoCadastro)
  const citado = palavras(nomeCitado)
  if (citado.length === 0) return false
  return citado.some((c) => cadastro.includes(c))
}

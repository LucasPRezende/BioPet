// Interpretação do resultado de PCR em tempo real (relatório do equipamento
// Bioguard). Só funções puras: usadas no front (tela /admin/novo-pcr), no
// gerador do laudo e nos testes (__tests__/pcr-resultado.test.ts).
//
// Quem decide o resultado é o Ct, pela tabela de referência impressa no próprio
// relatório do equipamento. O Ct é lido do PDF (Gemini) e conferido na tela;
// o resultado nunca vem da leitura do PDF.

export type StatusPcr = 'neg' | 'invalido' | 'pos_forte' | 'pos' | 'pos_fraco' | 'limitrofe'

export const STATUS_PCR: Record<StatusPcr, { label: string; curto: string; positivo: boolean }> = {
  neg:       { label: 'Negativo',             curto: 'Negativo',      positivo: false },
  invalido:  { label: 'Inválido (refazer)',   curto: 'Inválido',      positivo: false },
  pos_forte: { label: 'Positivo forte (+++)', curto: 'Positivo +++',  positivo: true  },
  pos:       { label: 'Positivo (++)',        curto: 'Positivo ++',   positivo: true  },
  pos_fraco: { label: 'Positivo fraco (+)',   curto: 'Positivo +',    positivo: true  },
  limitrofe: { label: 'Limítrofe (*)',        curto: 'Limítrofe',     positivo: false },
}

/** Tabela de referência do relatório Bioguard, na ordem em que é impressa. */
export const REFERENCIA_CT: { faixa: string; status: StatusPcr }[] = [
  { faixa: 'Ct = 0',       status: 'neg' },
  { faixa: '0 < Ct ≤ 10',  status: 'invalido' },
  { faixa: '10 < Ct ≤ 20', status: 'pos_forte' },
  { faixa: '20 < Ct ≤ 30', status: 'pos' },
  { faixa: '30 < Ct < 36', status: 'pos_fraco' },
  { faixa: '36 ≤ Ct ≤ 40', status: 'limitrofe' },
]

/**
 * Resultado a partir do Ct. `null` quando não dá para classificar (Ct ausente,
 * negativo ou acima de 40, fora da tabela): a pessoa precisa conferir.
 */
export function classificarCt(ct: number | null | undefined): StatusPcr | null {
  if (ct == null || !Number.isFinite(ct) || ct < 0) return null
  if (ct === 0)  return 'neg'
  if (ct <= 10)  return 'invalido'
  if (ct <= 20)  return 'pos_forte'
  if (ct <= 30)  return 'pos'
  if (ct < 36)   return 'pos_fraco'
  if (ct <= 40)  return 'limitrofe'
  return null
}

/** "12,5" / "12.5" / "0" → número; vazio ou inválido → null. */
export function parseCt(s: string | number | null | undefined): number | null {
  if (typeof s === 'number') return Number.isFinite(s) ? s : null
  const t = String(s ?? '').trim().replace(',', '.')
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

// ── Casamento do nome lido no PDF com o catálogo ─────────────────────────────

const RUIDO = new Set(['kit', 'de', 'do', 'da', 'das', 'dos', 'pcr', 'spp', 'sp', 'virus', 'e'])

/** Palavras significativas do nome, sem acento, caixa ou ruído ("spp", "kit de"...). */
export function palavrasChave(nome: string): string[] {
  return nome
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter(w => w.length > 1 && !RUIDO.has(w))
}

export interface ItemCatalogoPcr {
  id:       number
  nome:     string
  analitos: string[] | null
}

/**
 * Qual PCR do catálogo corresponde ao alvo lido no PDF ("Leishmania spp" →
 * "Leishmania spp."). Procura no nome e nos agentes (painéis). Prefere os
 * PCRs do agendamento quando informados. `null` se nada bater.
 */
export function casarAlvo(
  alvo: string,
  catalogo: ItemCatalogoPcr[],
  preferidos: number[] = [],
): ItemCatalogoPcr | null {
  const chave = palavrasChave(alvo)
  if (chave.length === 0) return null
  const bate = (nome: string) => {
    const p = palavrasChave(nome)
    return p.length > 0 && (p[0] === chave[0] || p.every(w => chave.includes(w)) || chave.every(w => p.includes(w)))
  }
  const candidatos = catalogo.filter(c => bate(c.nome) || (c.analitos ?? []).some(bate))
  if (candidatos.length === 0) return null
  // Nome exato do PCR ganha de "aparece como agente de um painel".
  const ordenados = [...candidatos].sort((a, b) => {
    const pa = preferidos.includes(a.id) ? 0 : 1
    const pb = preferidos.includes(b.id) ? 0 : 1
    if (pa !== pb) return pa - pb
    return (bate(a.nome) ? 0 : 1) - (bate(b.nome) ? 0 : 1)
  })
  return ordenados[0]
}

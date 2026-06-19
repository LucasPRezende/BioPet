export const ESPECIES = [
  'Canina', 'Felina', 'Lagomorfo', 'Aves',
  'Equina', 'Bovina', 'Ovina', 'Caprina',
] as const

export type Especie = typeof ESPECIES[number]

export const ESPECIES_ICON: Record<string, string> = {
  'Canina':    '🐕',
  'Felina':    '🐈',
  'Lagomorfo': '🐰',
  'Aves':      '🐦',
  'Equina':    '🐴',
  'Bovina':    '🐄',
  'Ovina':     '🐑',
  'Caprina':   '🐐',
}

export function especieIcon(especie: string | null): string {
  return especie ? (ESPECIES_ICON[especie] ?? '🐾') : '🐾'
}

// Sinônimos comuns (sem acento, minúsculo) → espécie canônica. Usado para
// normalizar entradas livres (ex.: o agente de WhatsApp manda "gato"/"felino"
// mas o sistema reconhece "Felina").
const SINONIMOS_ESPECIE: Record<string, Especie> = {
  gato: 'Felina', gata: 'Felina', felino: 'Felina', felina: 'Felina',
  cachorro: 'Canina', cachorra: 'Canina', cao: 'Canina', canino: 'Canina', canina: 'Canina', dog: 'Canina',
  coelho: 'Lagomorfo', coelha: 'Lagomorfo', lagomorfo: 'Lagomorfo',
  ave: 'Aves', aves: 'Aves', passaro: 'Aves', passarinho: 'Aves',
  cavalo: 'Equina', egua: 'Equina', equino: 'Equina', equina: 'Equina',
  boi: 'Bovina', vaca: 'Bovina', bovino: 'Bovina', bovina: 'Bovina',
  ovelha: 'Ovina', ovino: 'Ovina', ovina: 'Ovina',
  cabra: 'Caprina', bode: 'Caprina', caprino: 'Caprina', caprina: 'Caprina',
}

function semAcento(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/**
 * Converte uma espécie em texto livre para o valor canônico de {@link ESPECIES}.
 * Aceita o próprio canônico (em qualquer caixa) ou um sinônimo; se não
 * reconhecer, devolve o texto original (não perde o dado).
 */
export function normalizarEspecie(input: string | null | undefined): string | null {
  if (!input) return null
  const k = semAcento(input.trim().toLowerCase())
  const canon = ESPECIES.find(e => semAcento(e.toLowerCase()) === k)
  if (canon) return canon
  return SINONIMOS_ESPECIE[k] ?? input.trim()
}

// Mapeamento para o valor armazenado na tabela bioquimica_referencia
export const ESPECIE_PARA_REF: Record<string, string> = {
  'Canina':    'cao',
  'Felina':    'gato',
  'Lagomorfo': 'coelho',
  'Aves':      'ave',
  'Equina':    'equino',
  'Bovina':    'bovino',
  'Ovina':     'ovino',
  'Caprina':   'caprino',
}

// Label para exibição na tela de referências — derivado automaticamente de ESPECIES
export const ESPECIES_REF = ESPECIES.map(e => ({
  label: e,
  value: ESPECIE_PARA_REF[e] ?? e.toLowerCase(),
}))

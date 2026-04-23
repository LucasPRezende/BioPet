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

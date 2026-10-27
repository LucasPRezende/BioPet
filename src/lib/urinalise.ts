// Urinálise: parâmetros da fita (analisador URIT UC-32B), normalização do que
// a máquina mostra/imprime, status contra a referência e montagem das linhas
// do laudo. Sem dependências de servidor — usado também pelos testes e pela tela.
//
// A máquina não exporta arquivo: a equipe fotografa a tela ou a impressão e o
// Gemini lê (lib/ler-urina-foto.ts). O que vem da foto é texto ("Neg",
// "Normal", "<=1", "0.5", "1.025"); tudo é interpretado aqui.

export type TipoFita = 11 | 14

export interface ParametroUrina {
  /** Código usado na referência e no laudo (o mesmo da máquina, em maiúsculas). */
  codigo:  string
  nome:    string
  unidade: string
  /** Só a fita 14G traz este parâmetro. */
  so14?:   boolean
  /** Resultado é Negativo/Positivo (nitrito). */
  qualitativo?: boolean
  /** Casas decimais no laudo. */
  casas:   number
}

/** Ordem da impressão da máquina. */
export const PARAMETROS_URINA: ParametroUrina[] = [
  { codigo: 'LEU', nome: 'Leucócitos',             unidade: 'leu/µL', casas: 0 },
  { codigo: 'KET', nome: 'Cetonas',                unidade: 'mg/dL',  casas: 0 },
  { codigo: 'NIT', nome: 'Nitrito',                unidade: '',       casas: 0, qualitativo: true },
  { codigo: 'URO', nome: 'Urobilinogênio',         unidade: 'mg/dL',  casas: 1 },
  { codigo: 'BIL', nome: 'Bilirrubina',            unidade: 'mg/dL',  casas: 1 },
  { codigo: 'GLU', nome: 'Glicose',                unidade: 'mg/dL',  casas: 0 },
  { codigo: 'PRO', nome: 'Proteína',               unidade: 'mg/dL',  casas: 0 },
  { codigo: 'SG',  nome: 'Densidade (fita)',       unidade: '',       casas: 3 },
  { codigo: 'PH',  nome: 'pH',                     unidade: '',       casas: 1 },
  { codigo: 'BLD', nome: 'Sangue oculto',          unidade: 'mg/dL',  casas: 2 },
  { codigo: 'VC',  nome: 'Ácido ascórbico',        unidade: 'mg/dL',  casas: 0 },
  { codigo: 'MA',  nome: 'Microalbumina',          unidade: 'mg/dL',  casas: 0, so14: true },
  { codigo: 'CA',  nome: 'Cálcio',                 unidade: 'mg/dL',  casas: 0, so14: true },
  { codigo: 'CR',  nome: 'Creatinina',             unidade: 'mg/dL',  casas: 0, so14: true },
  { codigo: 'ACR', nome: 'Relação albumina/creatinina', unidade: 'mg/g', casas: 0, so14: true },
]

export function parametrosDaFita(fita: TipoFita): ParametroUrina[] {
  return PARAMETROS_URINA.filter(p => fita === 14 || !p.so14)
}

export function parametroUrina(codigo: string): ParametroUrina | undefined {
  return PARAMETROS_URINA.find(p => p.codigo === codigo)
}

/** Siglas como a máquina escreve → código do catálogo ("pH" → "PH", "Vc" → "VC"). */
export function codigoDaSigla(sigla: string): string | null {
  const k = sigla.replace(/[^a-z]/gi, '').toUpperCase()
  return PARAMETROS_URINA.some(p => p.codigo === k) ? k : null
}

/**
 * Junta o que o Gemini leu da foto ({sigla, valor}) no formato do catálogo.
 * Sigla repetida (duas fotos da mesma tela) fica com o primeiro valor não vazio.
 */
export function itensParaValores(itens: { sigla?: unknown; valor?: unknown }[]): { valores: Record<string, string>; desconhecidos: string[] } {
  const valores: Record<string, string> = {}
  const desconhecidos: string[] = []
  for (const it of itens) {
    const sigla = String(it?.sigla ?? '').trim()
    const valor = String(it?.valor ?? '').trim()
    if (!sigla) continue
    const codigo = codigoDaSigla(sigla)
    if (!codigo) { desconhecidos.push(sigla); continue }
    if (valor && !valores[codigo]) valores[codigo] = valor
  }
  return { valores, desconhecidos }
}

/** "Urinálise (11 parâmetros)", "URINALISE 14"... → tipo de fita (ou null se não é urinálise). */
export function fitaDoExame(tipoExame: string | null | undefined): TipoFita | null {
  const k = (tipoExame ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  if (!k.includes('urin')) return null
  return /\b14\b/.test(k) ? 14 : 11
}

// ── Valor lido ────────────────────────────────────────────────────────────────

export type Comparador = '=' | '<' | '<=' | '>' | '>='

export interface ValorUrina {
  /** Número para comparar com a referência (Neg/Normal = 0, Pos = 1); null se não deu para ler. */
  numero:     number | null
  comparador: Comparador
  /** Texto do laudo: "Negativo", "0,5", "≤ 1", "1,025". */
  texto:      string
}

/**
 * Interpreta o resultado como a máquina mostra: "Neg", "Pos", "Normal",
 * "0.5 mg/dL", "<=1", "<30 mg/g", "1.025", "+", "Traços"...
 * A unidade, se vier junto, é descartada (o catálogo define a do laudo).
 */
export function lerValorUrina(bruto: string, codigo: string): ValorUrina {
  const p = parametroUrina(codigo)
  const s = (bruto ?? '').trim().replace(/^\*+\s*/, '')
  const k = s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

  if (/^(neg|negativo|-)$/.test(k))       return { numero: 0, comparador: '=', texto: 'Negativo' }
  if (/^(pos|positivo|\+)$/.test(k))      return { numero: 1, comparador: '=', texto: 'Positivo' }
  if (/^normal$/.test(k))                 return { numero: 0, comparador: '=', texto: 'Normal' }

  const m = /^(<=|>=|≤|≥|<|>)?\s*(\d+(?:[.,]\d+)?)/.exec(s)
  if (!m) return { numero: null, comparador: '=', texto: s }

  const comparador = ({ '≤': '<=', '≥': '>=' } as Record<string, Comparador>)[m[1] ?? ''] ?? ((m[1] || '=') as Comparador)
  const numero = Number(m[2].replace(',', '.'))
  const casasDoValor = (m[2].split(/[.,]/)[1] ?? '').length
  const casas = Math.max(casasDoValor, codigo === 'SG' ? 3 : 0)
  const num = numero.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: Math.max(casas, p?.casas ?? 0) })
  const prefixo = { '=': '', '<': '< ', '<=': '≤ ', '>': '> ', '>=': '≥ ' }[comparador]

  // Qualitativo que veio como número (0/1)
  if (p?.qualitativo) return { numero, comparador, texto: numero > 0 ? 'Positivo' : 'Negativo' }
  return { numero, comparador, texto: prefixo + num }
}

// ── Referência e status ──────────────────────────────────────────────────────

export interface ReferenciaUrina {
  parametro: string
  valor_min: number | null
  valor_max: number | null
}

/** 'A' = alto (acima do máximo), 'B' = baixo, 'N' = dentro, '' = sem referência ou sem valor. */
export type StatusUrina = 'A' | 'B' | 'N' | ''

export function statusUrina(v: ValorUrina, ref: ReferenciaUrina | undefined): StatusUrina {
  if (v.numero === null || !ref) return ''
  if (ref.valor_min === null && ref.valor_max === null) return ''
  const n = v.numero
  // "<30" com máximo 30 está dentro; "<=1" com máximo 1 também. ">300" com máximo 300 está acima.
  const acima = ref.valor_max !== null && (
    v.comparador === '<' || v.comparador === '<=' ? false
    : v.comparador === '>' ? n >= ref.valor_max
    : n > ref.valor_max)
  const abaixo = ref.valor_min !== null && (
    v.comparador === '>' || v.comparador === '>=' ? false
    : v.comparador === '<' ? n <= ref.valor_min
    : n < ref.valor_min)
  if (acima)  return 'A'
  if (abaixo) return 'B'
  return 'N'
}

/** Texto da referência no laudo: "Negativo", "até 1", "1,015 – 1,045". */
export function textoReferencia(ref: ReferenciaUrina | undefined, codigo: string): string {
  if (!ref || (ref.valor_min === null && ref.valor_max === null)) return '—'
  const p = parametroUrina(codigo)
  const casas = p?.casas ?? 0
  const f = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: codigo === 'SG' || codigo === 'PH' ? casas : 0, maximumFractionDigits: casas })
  if (ref.valor_min === null && ref.valor_max === 0) return 'Negativo'
  if (ref.valor_min === null) return `até ${f(ref.valor_max!)}`
  if (ref.valor_max === null) return `≥ ${f(ref.valor_min)}`
  return `${f(ref.valor_min)} – ${f(ref.valor_max)}`
}

// ── Linhas do laudo ──────────────────────────────────────────────────────────

export interface LinhaUrina {
  codigo:     string
  nome:       string
  unidade:    string
  texto:      string
  referencia: string
  status:     StatusUrina
}

/**
 * Linhas da parte química, na ordem da fita. Parâmetro sem valor fica de fora
 * (ex.: 14G que só teve a primeira tela fotografada — a tela avisa antes).
 */
export function montarLinhasUrina(valores: Record<string, string>, referencias: ReferenciaUrina[]): LinhaUrina[] {
  const out: LinhaUrina[] = []
  for (const p of PARAMETROS_URINA) {
    const bruto = (valores[p.codigo] ?? '').trim()
    if (!bruto) continue
    const v   = lerValorUrina(bruto, p.codigo)
    const ref = referencias.find(r => r.parametro === p.codigo)
    // Unidade só faz sentido ao lado de número
    const unidade = v.numero !== null && !['Negativo', 'Positivo', 'Normal'].includes(v.texto) ? p.unidade : ''
    out.push({ codigo: p.codigo, nome: p.nome, unidade, texto: v.texto, referencia: textoReferencia(ref, p.codigo), status: statusUrina(v, ref) })
  }
  return out
}

/** Parâmetros da fita que ficaram sem valor (a foto não pegou tudo). */
export function parametrosFaltando(fita: TipoFita, valores: Record<string, string>): ParametroUrina[] {
  // A relação albumina/creatinina é calculada pela máquina e só sai na impressão
  return parametrosDaFita(fita).filter(p => p.codigo !== 'ACR' && !(valores[p.codigo] ?? '').trim())
}

/**
 * Notas automáticas de interpretação da fita que vão no laudo.
 * Ácido ascórbico (vitamina C) na urina inibe as reações de oxidação da fita.
 */
export function notasAutomaticas(valores: Record<string, string>): string[] {
  const notas: string[] = []
  const vc = lerValorUrina(valores.VC ?? '', 'VC')
  if (vc.numero !== null && vc.numero > 0 && vc.comparador !== '<' && vc.comparador !== '<=') {
    notas.push('Ácido ascórbico presente: pode causar falso-negativo de glicose, sangue oculto, bilirrubina e nitrito.')
  }
  return notas
}

// ── Exame físico e sedimentoscopia (digitados) ───────────────────────────────

export interface CampoManual {
  codigo:      string
  nome:        string
  /** Referência impressa no laudo (texto fixo). */
  referencia?: string
  /** Sugestões para o campo na tela. */
  opcoes?:     string[]
}

export const CAMPOS_FISICO: CampoManual[] = [
  { codigo: 'coleta',  nome: 'Método de coleta', opcoes: ['Cistocentese', 'Micção espontânea', 'Sondagem', 'Compressão vesical'] },
  { codigo: 'volume',  nome: 'Volume' },
  { codigo: 'cor',     nome: 'Cor',     referencia: 'Amarelo citrino a âmbar', opcoes: ['Amarelo citrino', 'Amarelo claro', 'Amarelo escuro', 'Âmbar', 'Avermelhada', 'Marrom', 'Incolor'] },
  { codigo: 'aspecto', nome: 'Aspecto', referencia: 'Límpido',                 opcoes: ['Límpido', 'Levemente turvo', 'Turvo'] },
  { codigo: 'odor',    nome: 'Odor',    referencia: 'Sui generis',             opcoes: ['Sui generis', 'Amoniacal', 'Pútrido', 'Cetônico'] },
  { codigo: 'densidade_refrat', nome: 'Densidade (refratômetro)' },
]

export const CAMPOS_SEDIMENTO: CampoManual[] = [
  { codigo: 'hemacias',   nome: 'Hemácias',               referencia: '0 – 5 /campo' },
  { codigo: 'leucocitos', nome: 'Leucócitos',             referencia: '0 – 5 /campo' },
  { codigo: 'cel_descamativas', nome: 'Células descamativas', opcoes: ['Ausentes', 'Raras', 'Algumas', 'Numerosas'] },
  { codigo: 'cel_transicao',    nome: 'Células de transição', opcoes: ['Ausentes', 'Raras', 'Algumas', 'Numerosas'] },
  { codigo: 'cel_renais',       nome: 'Células renais',       opcoes: ['Ausentes', 'Raras', 'Algumas', 'Numerosas'] },
  { codigo: 'cilindros',  nome: 'Cilindros',              referencia: 'Ausentes', opcoes: ['Ausentes', 'Hialinos', 'Granulosos', 'Céreos', 'Hemáticos', 'Leucocitários'] },
  { codigo: 'cristais',   nome: 'Cristais',               opcoes: ['Ausentes', 'Estruvita', 'Oxalato de cálcio di-hidratado', 'Oxalato de cálcio mono-hidratado', 'Urato amorfo', 'Fosfato amorfo', 'Bilirrubina', 'Biurato de amônio', 'Cistina'] },
  { codigo: 'bacterias',  nome: 'Bactérias',              referencia: 'Ausentes', opcoes: ['Ausentes', 'Raras', 'Moderadas', 'Numerosas'] },
  { codigo: 'muco',       nome: 'Filamentos de muco',     opcoes: ['Ausentes', 'Raros', 'Presentes'] },
  { codigo: 'outros',     nome: 'Outros' },
]

export interface LinhaManual { nome: string; valor: string; referencia: string }

/** Linhas preenchidas de uma seção manual, na ordem do catálogo. Vazias ficam de fora. */
export function linhasManuais(campos: CampoManual[], valores: Record<string, string>): LinhaManual[] {
  return campos
    .map(c => ({ nome: c.nome, valor: (valores[c.codigo] ?? '').trim(), referencia: c.referencia ?? '' }))
    .filter(l => l.valor)
}

// ── Validação antes de emitir ────────────────────────────────────────────────

/**
 * Erro que impede emitir o laudo, ou '' se está ok. Fita 11G com parâmetro
 * que só a 14G tem quase sempre é foto da amostra errada ou exame trocado.
 */
export function validarUrinalise(l: { nome_pet?: string; especie?: string; fita?: number; valores?: Record<string, string> }): string {
  if (!l.nome_pet?.trim()) return 'Informe o nome do paciente.'
  if (!l.especie)          return 'Informe a espécie (define os valores de referência).'
  if (l.fita !== 11 && l.fita !== 14) return 'Tipo de fita inválido (11 ou 14 parâmetros).'
  const preenchidos = Object.entries(l.valores ?? {}).filter(([, v]) => String(v ?? '').trim())
  if (preenchidos.length === 0) return 'Nenhum resultado da fita informado.'
  const desconhecido = preenchidos.find(([k]) => !parametroUrina(k))
  if (desconhecido) return `Parâmetro desconhecido: ${desconhecido[0]}.`
  if (l.fita === 11) {
    const so14 = preenchidos.filter(([k]) => parametroUrina(k)?.so14).map(([k]) => k)
    if (so14.length) return `A fita de 11 parâmetros não tem ${so14.join(', ')}. Confira se o exame é o de 14 parâmetros.`
  }
  return ''
}

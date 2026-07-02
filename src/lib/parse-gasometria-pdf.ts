import 'server-only'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse') as (
  data: Buffer,
  options?: { pagerender?: (page: unknown) => Promise<string> }
) => Promise<{ text: string }>

export interface GasometriaExame {
  grupo:     string
  nome:      string
  valor:     string
  unidade:   string
  status:    'H' | 'L' | ''
  valor_min: number | null
  valor_max: number | null
}

export interface GasometriaData {
  nome_pet:     string
  especie:      string
  tutor:        string
  idade:        string
  tipo_amostra: string
  lab:          string
  operador:     string
  data_teste:   string
  exames:       GasometriaExame[]
}

// Custom page renderer that inserts spaces based on x-coordinate gaps between text items,
// matching how the PDF is visually displayed. The default pdf-parse renderer concatenates
// text without gaps, making token parsing impossible.
async function pageRender(pageData: unknown): Promise<string> {
  type TextItem = { str: string; transform: number[]; width?: number }
  type Page = { getTextContent: () => Promise<{ items: TextItem[] }> }

  const content = await (pageData as Page).getTextContent()
  let text = ''
  let prev: TextItem | null = null

  for (const item of content.items) {
    if (prev) {
      const x0    = prev.transform[4]
      const w0    = prev.width ?? prev.str.length * 4
      const x1    = item.transform[4]
      const yGap  = Math.abs(item.transform[5] - prev.transform[5])
      const xGap  = x1 - (x0 + w0)
      if (yGap > 2)  text += '\n'
      else if (xGap > 1) text += ' '
    }
    text += item.str
    prev = item
  }
  return text
}

// Stops the lazy capture only at known key labels, not at any word-before-colon.
// This prevents "Sangue Venoso Lote reagente No.:" from stopping at "Venoso...No.:".
const KEY_STOP = '(?:Nome animal|Espécies|ID paciente|Amostra|Idade|Tipo amostra|Lote reagente No\\.|Reagente|Operador|Lab|Horário teste|Máquina|Versão|Tutor):'

function extractField(text: string, key: string): string {
  const k = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const m = text.match(new RegExp(k + ':([^\\n]+?)(?=\\s+' + KEY_STOP + '|\\n|$)', 'm'))
  return m?.[1]?.trim() ?? ''
}

// Parses a single exam line: "name value[unit] [H|L] min-max"
// Tokens are space-separated thanks to the custom page renderer.
function parseExamLine(line: string, grupo: string): GasometriaExame | null {
  const tokens = line.trim().split(/\s+/)
  if (tokens.length < 2) return null

  // Find the first token starting with a digit (or negative digit)
  let vi = -1
  for (let i = 0; i < tokens.length; i++) {
    if (/^-?\d/.test(tokens[i])) { vi = i; break }
  }
  if (vi <= 0) return null // must have at least one name token before the value

  const nome = tokens.slice(0, vi).join(' ')
  const vm   = tokens[vi].match(/^(-?\d+\.?\d*)(.*)$/)
  if (!vm) return null

  const valor   = vm[1]
  const unidade = vm[2].trim()

  let status: 'H' | 'L' | '' = ''
  let rest = tokens.slice(vi + 1)

  if (rest[0] === 'H')      { status = 'H'; rest = rest.slice(1) }
  else if (rest[0] === 'L') { status = 'L'; rest = rest.slice(1) }

  // Reference range is "min-max" (the remaining token), possibly with trailing unit text
  const refStr = rest.join('')
  let valor_min: number | null = null
  let valor_max: number | null = null

  if (refStr) {
    // Handles negative min: "-8.5-6.0" → min=-8.5, max=6.0
    const rm = refStr.match(/^(-?\d+\.?\d*)-(\d+\.?\d*)/)
    if (rm) { valor_min = parseFloat(rm[1]); valor_max = parseFloat(rm[2]) }
  }

  return { grupo, nome, valor, unidade, status, valor_min, valor_max }
}

function formatGroupName(raw: string): string {
  return raw
    .replace(/^Projeto\s+/i, '')
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

const GROUP_RE  = /^(?:Projeto\s+.+|Hematócrito|Calcular itens)$/i
const FOOTER_RE = /^(?:--Indica|Endereço hospital|Telefone contato|\*\s*Este)/i

export async function parseGasometriaPDF(buffer: Buffer): Promise<GasometriaData> {
  const { text } = await pdfParse(buffer, { pagerender: pageRender })
  const lines    = text.split('\n').map((l: string) => l.trim()).filter(Boolean)

  const nome_pet     = extractField(text, 'Nome animal')
  const especie      = extractField(text, 'Espécies')
  const tutor        = extractField(text, 'Tutor')
  const idade        = extractField(text, 'Idade')
  const tipo_amostra = extractField(text, 'Tipo amostra')
  const lab          = extractField(text, 'Lab')
  const operador     = extractField(text, 'Operador')
  const horario      = extractField(text, 'Horário teste')
  // "2026.07.01 11:06:34" → "2026-07-01"
  const data_teste   = horario.replace(/^(\d{4})\.(\d{2})\.(\d{2}).*/, '$1-$2-$3')

  // Exam data starts after the column-header line "Ensaio Resultado ..."
  const ensaioIdx   = lines.findIndex((l: string) => /^Ensaio\s+Resultado/i.test(l))
  const afterHeader = ensaioIdx >= 0 ? lines.slice(ensaioIdx + 1) : lines
  const footerIdx   = afterHeader.findIndex((l: string) => FOOTER_RE.test(l))
  const examSection = footerIdx >= 0 ? afterHeader.slice(0, footerIdx) : afterHeader

  const exames: GasometriaExame[] = []
  let currentGrupo = ''

  for (const line of examSection) {
    if (GROUP_RE.test(line)) {
      currentGrupo = formatGroupName(line)
      continue
    }
    const exam = parseExamLine(line, currentGrupo)
    if (exam) exames.push(exam)
  }

  return { nome_pet, especie, tutor, idade, tipo_amostra, lab, operador, data_teste, exames }
}

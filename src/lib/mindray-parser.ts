import AdmZip from 'adm-zip'
import { EXAM_CODES, type MindrayResult, type MindrayData } from './mindray-types'

export { EXAM_CODES } from './mindray-types'
export type { MindrayResult, MindrayData } from './mindray-types'

// Sorted by length descending so longer codes match first (UREIA before U, etc.)
const SORTED_CODES = Object.keys(EXAM_CODES).sort((a, b) => b.length - a.length)

interface Glyph {
  x: number
  y: number
  text: string
}

function extractGlyphs(xml: string): Glyph[] {
  const glyphs: Glyph[] = []
  let pos = 0
  while (true) {
    const start = xml.indexOf('<Glyphs', pos)
    if (start === -1) break
    const end = xml.indexOf('/>', start)
    if (end === -1) break
    const elem = xml.slice(start, end + 2)
    const xm = elem.match(/OriginX="([^"]+)"/)
    const ym = elem.match(/OriginY="([^"]+)"/)
    const um = elem.match(/UnicodeString="([^"]+)"/)
    if (xm && ym && um) {
      const text = um[1].trim()
      if (text) glyphs.push({ x: parseFloat(xm[1]), y: parseFloat(ym[1]), text })
    }
    pos = end + 2
  }
  return glyphs
}

/** Group glyphs into rows using ±Y_TOL tolerance */
function groupByRow(glyphs: Glyph[]): Glyph[][] {
  const Y_TOL = 5
  const rows: Glyph[][] = []
  for (const g of glyphs) {
    const existing = rows.find(row => Math.abs(row[0].y - g.y) <= Y_TOL)
    if (existing) {
      existing.push(g)
    } else {
      rows.push([g])
    }
  }
  return rows
}

/** Extract the first known exam code from the start of a string.
 *  e.g. "AMILAlfa AmilaseU/L" → "AMIL", "TGP" → "TGP"
 */
function extractCode(text: string): string | null {
  const upper = text.toUpperCase()
  for (const code of SORTED_CODES) {
    if (upper === code || upper.startsWith(code)) return code
  }
  return null
}

/** Parse result token like "39Normal", "1071H", "0.05Normal" */
function parseResultToken(text: string): { valor: string; status: MindrayResult['status'] } {
  const m = text.match(/^([<>]?[\d]+[.,]?[\d]*)(.*)$/)
  if (!m) return { valor: text, status: '' }

  const valor = m[1].replace(',', '.')
  const flag  = m[2].trim().toUpperCase()

  let status: MindrayResult['status'] = ''
  if      (flag === 'H' || flag === 'HIGH' || flag === 'ALTO' || flag === 'ELEVADO' || flag === 'MUITO ALTO') status = 'H'
  else if (flag === 'L' || flag === 'LOW'  || flag === 'BAIXO' || flag === 'MUITO BAIXO')                    status = 'L'
  else if (flag === 'N' || flag === 'NORMAL')                                                                 status = 'N'

  return { valor, status }
}

/** Parse "GUERREIROMasc10Ano" → { nome, sexo, idade } */
function parsePatientToken(text: string): { nome: string; sexo: string; idade: string } | null {
  const m = text.match(/^([A-ZÁÉÍÓÚÇÃÕÀÂÊÔÜ ]+?)(Masc(?:ulino)?|Fem(?:ino|ea|êa|inino)?|Macho|F[êe]mea)(\d+)(Anos?|Mes(?:es)?|M[êe]s?)/i)
  if (!m) return null
  const sexo = m[2].toLowerCase().startsWith('m') ? 'Macho' : 'Fêmea'
  return { nome: m[1].trim(), sexo, idade: `${m[3]} ${m[4]}` }
}

export function parseMindrayXPS(buffer: Buffer): MindrayData {
  const zip = new AdmZip(buffer)

  // Find the first .fpage file
  let xml: string | null = null
  for (const entry of zip.getEntries()) {
    if (/\.fpage$/i.test(entry.entryName)) {
      xml = entry.getData().toString('utf-8')
      break
    }
  }
  if (!xml) throw new Error('Arquivo XPS inválido: nenhuma página encontrada.')

  const glyphs = extractGlyphs(xml)
  glyphs.sort((a, b) => a.y - b.y || a.x - b.x)

  const rows = groupByRow(glyphs)
  const raw_texts = glyphs.map(g => g.text)

  // ── Patient info (y < 180) ───────────────────────────────────────────────────
  let paciente  = ''
  let especie   = ''
  let sexo      = ''
  let idade     = ''
  let sample_id = ''

  const headerGlyphs = glyphs.filter(g => g.y < 180)

  for (const g of headerGlyphs) {
    const patient = parsePatientToken(g.text)
    if (patient && !paciente) {
      paciente = patient.nome
      sexo     = patient.sexo
      idade    = patient.idade
    }
  }

  // Sample ID: token to the right of "ID amost:" label
  const headerRow72 = rows.find(row =>
    row.some((g: Glyph) => g.y < 80 && g.text.includes('ID amost'))
  )
  if (headerRow72) {
    const labelG = headerRow72.find((g: Glyph) => g.text.includes('ID amost'))
    if (labelG) {
      const idG = headerRow72.filter((g: Glyph) => g.x > labelG.x).sort((a: Glyph, b: Glyph) => a.x - b.x)[0]
      if (idG && !idG.text.includes(':')) sample_id = idG.text
    }
  }

  // ── Date (footer, y > 460) ───────────────────────────────────────────────────
  let data_exame = ''
  const footerGlyphs = glyphs.filter(g => g.y > 460)

  const dateRow = rows.find(row =>
    row.some((g: Glyph) => g.y > 460 && g.text.toLowerCase().includes('data teste'))
  )
  if (dateRow) {
    const labelG = dateRow.find((g: Glyph) => g.text.toLowerCase().includes('data teste'))
    if (labelG) {
      const dateG = dateRow.filter((g: Glyph) => g.x > labelG.x).sort((a: Glyph, b: Glyph) => a.x - b.x)[0]
      if (dateG) data_exame = dateG.text
    }
  }

  if (!data_exame) {
    const dateG = footerGlyphs.find(g => /\d{2}\/\d{2}\/\d{4}/.test(g.text))
    if (dateG) data_exame = dateG.text
  }

  // ── Exam results (data area: y 195–465) ──────────────────────────────────────
  const resultados: MindrayResult[] = []
  const seenCodes = new Set<string>()

  for (const row of rows) {
    const rowY = row[0].y
    if (rowY < 195 || rowY > 465) continue

    // Code token: lowest X in row (x < 100)
    const codeTokens = row.filter((g: Glyph) => g.x < 100).sort((a: Glyph, b: Glyph) => a.x - b.x)
    // Result token: x in range 280–420
    const resultToken = row.filter((g: Glyph) => g.x >= 280 && g.x < 420).sort((a: Glyph, b: Glyph) => a.x - b.x)[0]
    // Unit token: x in range 380–480 (sometimes separate)
    const unitToken = row.filter((g: Glyph) => g.x >= 380 && g.x < 480 && /^[\w/]+$/.test(g.text))[0]

    if (!resultToken) continue
    if (!/^[<>]?[\d]/.test(resultToken.text)) continue

    for (const codeToken of codeTokens) {
      const code = extractCode(codeToken.text)
      if (!code || seenCodes.has(code)) continue

      const { valor, status } = parseResultToken(resultToken.text)
      const unidade = unitToken?.text ?? EXAM_CODES[code]?.unidade ?? ''

      resultados.push({
        codigo:  code,
        nome:    EXAM_CODES[code]?.nome ?? code,
        valor,
        unidade,
        status,
        metodo: '',
      })
      seenCodes.add(code)
      break
    }
  }

  return { paciente, especie, sexo, idade, data_exame, sample_id, resultados, raw_texts }
}

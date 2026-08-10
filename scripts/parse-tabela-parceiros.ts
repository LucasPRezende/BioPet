/**
 * parse-tabela-parceiros.ts — parseia tabela-parceiros-extraida.txt (extração
 * crua do PDF "Tabela de valores Biopet Tecsa e Hormonalle") e gera:
 *
 *   - scripts/lab-exames.json        → linhas prontas para importar em lab_exames
 *   - scripts/lab-exames-report.md   → relatório de conferência (linhas sem nome,
 *                                      páginas com órfãos não casados, contagens
 *                                      por categoria vs. o declarado no PDF)
 *
 * A extração do PDF quebrou células longas: o conteúdo saiu da linha e foi parar
 * no fim da página como "células órfãs". As linhas de dados ficam sem nome (ou
 * sem tubo/material/espécie). Estratégia:
 *   1. Linhas físicas que terminam com espaço são continuação → junta.
 *   2. Divide em páginas pelo cabeçalho repetido ("CódigoExame..."/"CategoriaExame...").
 *   3. Em cada página, casa (em ordem) as linhas sem nome com as células órfãs
 *      que são nomes (≥80% maiúsculas). Só casa quando as contagens batem —
 *      senão vai para o relatório para resolução manual.
 *
 * Uso: npx tsx scripts/parse-tabela-parceiros.ts
 */
import * as fs from 'fs'
import * as path from 'path'

const INPUT = path.join(__dirname, '..', 'tabela-parceiros-extraida.txt')
const OUT_JSON = path.join(__dirname, 'lab-exames.json')
const OUT_REPORT = path.join(__dirname, 'lab-exames-report.md')

export interface LabExameRow {
  lab: 'Tecsa' | 'Hormonalle'
  categoria: string | null
  codigo: string | null
  nome: string | null            // null = não recuperado (vai pro relatório)
  cor_tubo: string | null
  material_tipo: string | null
  material_volume_ml: number | null
  especies: string | null
  prazo_dias_uteis: number | null
  custo: number | null
  preco_cliente: number | null
  sob_consulta: boolean
  is_combo: boolean
  linha: number                  // linha física no txt (debug/conferência)
}

// ── Vocabulários ──────────────────────────────────────────────────────────────

// Início de célula "cor do tubo" (case-sensitive: nomes de exame são CAIXA ALTA,
// então 'Roxa'/'Azul'... com minúsculas marca a transição nome→tubo). O lookahead
// negativo evita casar prefixo de outra palavra, mas aceita concatenação com a
// célula seguinte ('LâminaCanina', 'Verde0,5').
const NO_LOWER = '(?![a-zà-öø-ÿ])'
const TUBE_START = new RegExp(`(Roxa|Azul|Vermelha|Amarela|Branca|Cinza|Verde|Lâmina${NO_LOWER}|Tubo estéril|Frasco|Bloco${NO_LOWER}|Coletor de)`)

// Início de célula "quantidade de material".
const MATERIAL_START = new RegExp(
  `(No mínimo|Mínimo|Swab${NO_LOWER}|Aspirado|Consultar|` +
  `\\d+ ?,\\d+ ?(?:mL|ml|g${NO_LOWER}|de )|` +
  `\\d+ ?(?:mL|ml|g${NO_LOWER}|lâminas?|swabs?|escovas|pelos))`)

// Início de célula "espécie" (case-sensitive pelo mesmo motivo).
const SPECIES_START = new RegExp(
  `(Canina|Caninos|Felina|Felinos|Equina|Exclusivamente|Arara|Aves|Bovina|Suína|Todas)${NO_LOWER}`)

const PRICE_TAIL = /(R\$ ?[\d.,]+|Sob [Cc]onsulta) ?(R\$ ?[\d.,]+|Sob [Cc]onsulta)$/
// Depois do join as sequências de espaço viram um espaço só.
const CATEGORY_LINE = /^(.{2,60}?) \((\d+) exames?\)$/
// Fragmentos de cabeçalho da tabela que contaminam células órfãs.
const ORPHAN_JUNK = /CÓDI|EXAME DIAS|DIAS ÚTEIS|VALORES$/

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseBRL(s: string): number | null {
  if (/sob/i.test(s)) return null
  const n = parseFloat(s.replace(/R\$\s?/, '').replace(/\./g, '').replace(',', '.'))
  return isNaN(n) ? null : n
}

function upperRatio(s: string): number {
  const letters = s.replace(/[^a-zA-ZÀ-ÿ]/g, '')
  if (!letters) return 0
  const uppers = letters.replace(/[^A-ZÀ-Þ]/g, '')
  return uppers.length / letters.length
}

function volumeFromMaterial(material: string | null): number | null {
  if (!material) return null
  const m = material.match(/(\d+),(\d+) ?m?[lL]/)
  return m ? parseFloat(`${m[1]}.${m[2]}`) : null
}

function isCombo(nome: string | null): boolean {
  if (!nome) return false
  return /PERFIL|PAINEL|TRIAGEM|CHECK ?-? ?UP| \+ |\+ /i.test(nome)
}

// Junta linhas físicas: linha terminando em espaço continua na próxima.
function joinLines(raw: string[], startIdx: number): { text: string; linha: number }[] {
  const out: { text: string; linha: number }[] = []
  let buf = ''
  let bufLine = 0
  for (let i = 0; i < raw.length; i++) {
    const line = raw[i]
    if (!buf) bufLine = startIdx + i + 1
    buf += line
    if (buf.endsWith(' ')) continue // célula quebrada, continua na próxima linha
    const text = buf.replace(/\s+/g, ' ').trim()
    if (text) out.push({ text, linha: bufLine })
    buf = ''
  }
  if (buf.trim()) out.push({ text: buf.replace(/\s+/g, ' ').trim(), linha: bufLine })
  return out
}

// ── Parse de uma linha de dados ───────────────────────────────────────────────

interface Tail {
  prazo: number | null
  custo: number | null
  precoCliente: number | null
  sobConsulta: boolean
  rest: string // o que sobrou antes de prazo/preços
  ambiguo?: boolean
}

/** Extrai (do fim) os dois preços e o prazo. Retorna null se não é linha de dados. */
function parseTail(text: string): Tail | null {
  const m = text.match(PRICE_TAIL)
  if (!m) return null
  const custo = parseBRL(m[1])
  const precoCliente = parseBRL(m[2])
  let rest = text.slice(0, m.index).trim()

  let prazo: number | null = null
  let ambiguo = false
  const sob = rest.match(/Sob [Cc]onsulta$/)
  if (sob) {
    rest = rest.slice(0, sob.index).trim()
  } else {
    const d = rest.match(/(\d+)$/)
    if (d) {
      let run = d[1]
      if (run.length > 2) {
        // Dígitos do prazo colados em outra coisa numérica (ex.: código puro
        // "11121" = código 1112 + prazo 1). Preferir prazo de 1 dígito quando
        // o que sobra forma um código plausível (≤4 dígitos); senão 2 dígitos.
        const take = run.length - 1 <= 4 && /^\d+$/.test(rest) ? 1 : 2
        run = run.slice(-take)
        ambiguo = /^\d+$/.test(rest)
      }
      prazo = parseInt(run)
      rest = rest.slice(0, rest.length - run.length).trim()
    }
  }
  return { prazo, custo, precoCliente, sobConsulta: custo === null || precoCliente === null, rest, ambiguo }
}

interface Middle {
  nome: string | null
  tubo: string | null
  material: string | null
  especies: string | null
}

/** Divide o miolo (nome + tubo + material + espécie, concatenados) por vocabulário. */
function parseMiddle(mid: string): Middle {
  const idx = (re: RegExp, from = 0): number => {
    const m = mid.slice(from).match(re)
    return m ? from + (m.index ?? 0) : -1
  }
  const starts = [idx(TUBE_START), idx(MATERIAL_START), idx(SPECIES_START)].filter(i => i >= 0)
  const nameEnd = starts.length ? Math.min(...starts) : mid.length
  const nome = mid.slice(0, nameEnd).trim() || null

  let tubo: string | null = null
  let material: string | null = null
  let especies: string | null = null

  let pos = nameEnd
  const tubeAt = idx(TUBE_START, pos)
  if (tubeAt === pos && pos < mid.length) {
    // tubo vai até o início do material ou da espécie (busca a partir de pos+1)
    const matAt = idx(MATERIAL_START, pos + 1)
    const spAt = idx(SPECIES_START, pos + 1)
    const end = Math.min(...[matAt, spAt, mid.length].filter(i => i >= 0))
    tubo = mid.slice(pos, end).trim() || null
    pos = end
  }
  const matAt = idx(MATERIAL_START, pos)
  if (matAt === pos && pos < mid.length) {
    const spAt = idx(SPECIES_START, pos + 1)
    const end = spAt >= 0 ? spAt : mid.length
    material = mid.slice(pos, end).trim() || null
    pos = end
  }
  if (pos < mid.length) especies = mid.slice(pos).trim() || null
  return { nome, tubo, material, especies }
}

// ── Parse por seção ───────────────────────────────────────────────────────────

interface PageIssue {
  page: number
  semNome: { codigo: string | null; linha: number }[]
  orfaos: string[]
}

interface SectionResult {
  rows: LabExameRow[]
  issues: PageIssue[]
  categorias: Map<string, { declarado: number; parseado: number }>
  descartadas: { text: string; linha: number }[]
  ambiguas: LabExameRow[]
}

function parseSection(
  lab: 'Tecsa' | 'Hormonalle',
  logical: { text: string; linha: number }[],
): SectionResult {
  const rows: LabExameRow[] = []
  const issues: PageIssue[] = []
  const categorias = new Map<string, { declarado: number; parseado: number }>()
  const descartadas: { text: string; linha: number }[] = []
  const ambiguas: LabExameRow[] = []

  let categoria: string | null = null
  let page = 1
  let pageRows: LabExameRow[] = []
  let pageOrphanNames: string[] = []

  const JUNK = /^(Dias Úteis|Valor de Custo|Valor \+40% Lucro|Vet e Clínica Parceira|Prazo \(dias úteis\)|CódigoExame|CategoriaExame|TECSA —|HORMONALLE —|Fonte:)/

  function flushPage() {
    const semNome = pageRows.filter(r => r.nome === null)
    if (semNome.length && semNome.length === pageOrphanNames.length) {
      semNome.forEach((r, i) => {
        r.nome = pageOrphanNames[i]
        r.is_combo = isCombo(r.nome)
      })
    } else if (semNome.length || pageOrphanNames.length) {
      issues.push({
        page,
        semNome: semNome.map(r => ({ codigo: r.codigo, linha: r.linha })),
        orfaos: [...pageOrphanNames],
      })
    }
    rows.push(...pageRows)
    pageRows = []
    pageOrphanNames = []
    page++
  }

  for (const { text, linha } of logical) {
    if (/^(CódigoExame|CategoriaExame)/.test(text)) { flushPage(); continue }
    if (JUNK.test(text)) continue

    const cat = text.match(CATEGORY_LINE)
    if (cat) {
      categoria = cat[1].trim()
      categorias.set(categoria, { declarado: parseInt(cat[2]), parseado: 0 })
      continue
    }

    const tail = parseTail(text)
    if (tail) {
      let mid = tail.rest
      let codigo: string | null = null
      if (lab === 'Tecsa') {
        // O código pode estar colado num material que começa com dígito
        // ('5780,5 mL' = código 578 + '0,5 mL'). Testa do maior para o menor
        // comprimento e fica com o primeiro em que o resto começa em uma
        // fronteira reconhecível (nome em caixa alta, tubo, material, espécie).
        const digits = mid.match(/^\d+/)
        if (!digits) { descartadas.push({ text, linha }); continue }
        const maxLen = Math.min(4, digits[0].length)
        for (let len = maxLen; len >= 1; len--) {
          const rest = mid.slice(len)
          const ok = rest === '' || /^[A-ZÀ-Þ(]/.test(rest) ||
            [TUBE_START, MATERIAL_START, SPECIES_START].some(re => {
              const m = rest.match(re); return m ? m.index === 0 : false
            })
          if (ok) { codigo = digits[0].slice(0, len); break }
        }
        if (!codigo) codigo = digits[0].slice(0, maxLen)
        mid = mid.slice(codigo.length)
      } else {
        // Hormonalle: prefixo é a categoria corrente (às vezes ausente, quando a
        // célula de categoria foi quebrada e virou órfã).
        if (categoria && mid.startsWith(categoria)) mid = mid.slice(categoria.length)
      }
      const { nome, tubo, material, especies } = parseMiddle(mid)
      const row: LabExameRow = {
        lab,
        categoria,
        codigo,
        nome,
        cor_tubo: tubo,
        material_tipo: material,
        material_volume_ml: volumeFromMaterial(material),
        especies,
        prazo_dias_uteis: tail.prazo,
        custo: tail.custo,
        preco_cliente: tail.precoCliente,
        sob_consulta: tail.sobConsulta,
        is_combo: isCombo(nome),
        linha,
      }
      if (tail.ambiguo) ambiguas.push(row)
      pageRows.push(row)
      if (categoria) {
        const c = categorias.get(categoria)
        if (c) c.parseado++
      }
      continue
    }

    // Não é dado, categoria nem cabeçalho → célula órfã.
    if (upperRatio(text) >= 0.8 && text.length > 3 && !ORPHAN_JUNK.test(text)) {
      // Nome quebrado com hífen colado na letra ('(PRCD-' + 'PRA) - CANINO')
      // não é juntado pelo joinLines; junta aqui com o órfão anterior. Hífen
      // precedido de espaço ('...FELINA -') é truncamento do próprio PDF, não
      // quebra de linha — não junta.
      const prev = pageOrphanNames[pageOrphanNames.length - 1]
      if (prev && /[A-ZÀ-Þ][-–]$/.test(prev)) {
        pageOrphanNames[pageOrphanNames.length - 1] = prev + text
      } else {
        pageOrphanNames.push(text)
      }
    } else {
      descartadas.push({ text, linha })
    }
  }
  flushPage()
  return { rows, issues, categorias, descartadas, ambiguas }
}

// ── Main ──────────────────────────────────────────────────────────────────────

function main() {
  const raw = fs.readFileSync(INPUT, 'utf-8').split(/\r?\n/)

  const hormIdx = raw.findIndex(l => l.startsWith('HORMONALLE —'))
  if (hormIdx < 0) throw new Error('Seção HORMONALLE não encontrada')

  const tecsa = parseSection('Tecsa', joinLines(raw.slice(0, hormIdx), 0))
  const horm = parseSection('Hormonalle', joinLines(raw.slice(hormIdx), hormIdx))

  const all = [...tecsa.rows, ...horm.rows]
  fs.writeFileSync(OUT_JSON, JSON.stringify(all, null, 2), 'utf-8')

  // ── Relatório ──
  const L: string[] = ['# Relatório do parse da tabela de labs parceiros', '']
  for (const [lab, r] of [['Tecsa', tecsa], ['Hormonalle', horm]] as const) {
    const total = r.rows.length
    const semNome = r.rows.filter(x => x.nome === null).length
    const sobConsulta = r.rows.filter(x => x.sob_consulta).length
    L.push(`## ${lab}`, '')
    L.push(`- **${total}** exames parseados (${semNome} sem nome, ${sobConsulta} sob consulta)`, '')
    L.push('| Categoria | Declarado no PDF | Parseado |', '|---|---|---|')
    for (const [cat, c] of r.categorias) {
      const flag = c.declarado === c.parseado ? '' : ' ⚠️'
      L.push(`| ${cat} | ${c.declarado} | ${c.parseado}${flag} |`)
    }
    L.push('')
    if (r.issues.length) {
      L.push(`### Páginas com órfãos não casados (${lab})`, '')
      for (const iss of r.issues) {
        L.push(`- Página ${iss.page}: ${iss.semNome.length} linha(s) sem nome ` +
          `(códigos: ${iss.semNome.map(s => s.codigo ?? `linha ${s.linha}`).join(', ')}) vs ` +
          `${iss.orfaos.length} nome(s) órfão(s):`)
        for (const o of iss.orfaos) L.push(`    - ${o}`)
      }
      L.push('')
    }
    if (r.ambiguas.length) {
      L.push(`### Código/prazo ambíguos (conferir) — ${lab}`, '')
      for (const a of r.ambiguas) L.push(`- linha ${a.linha}: código ${a.codigo}, prazo ${a.prazo_dias_uteis} — ${a.nome ?? '(sem nome)'}`)
      L.push('')
    }
    if (r.descartadas.length) {
      L.push(`### Células órfãs descartadas (tubo/material/espécie perdidos) — ${lab}: ${r.descartadas.length}`, '')
      for (const d of r.descartadas.slice(0, 80)) L.push(`- linha ${d.linha}: ${d.text.slice(0, 100)}`)
      if (r.descartadas.length > 80) L.push(`- ... (+${r.descartadas.length - 80})`)
      L.push('')
    }
  }
  fs.writeFileSync(OUT_REPORT, L.join('\n'), 'utf-8')

  const semNome = all.filter(x => x.nome === null).length
  console.log(`✔ ${all.length} exames (Tecsa ${tecsa.rows.length}, Hormonalle ${horm.rows.length})`)
  console.log(`  ${semNome} sem nome | relatório: scripts/lab-exames-report.md`)
}

main()

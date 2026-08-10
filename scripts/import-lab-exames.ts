/**
 * import-lab-exames.ts — importa scripts/lab-exames.json (gerado por
 * parse-tabela-parceiros.ts) para lab_laboratorios/lab_exames.
 *
 * Pré-requisito: migration v39 aplicada (cria as tabelas e os seeds
 * 'Tecsa'/'Hormonalle' em lab_laboratorios).
 *
 * Uso:
 *   npx tsx scripts/import-lab-exames.ts [.env.local]      → dry-run (só mostra)
 *   npx tsx scripts/import-lab-exames.ts [.env.local] --go → insere de verdade
 *
 * Idempotente: linhas que já existem no banco (mesmo código no lab, ou mesmo
 * nome+categoria quando não há código) são puladas — rodar de novo só insere o
 * que falta. Duplicatas de código do próprio PDF (995, 1034, 1035, 1161) são
 * deduplicadas mantendo a primeira ocorrência.
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'

const envFile = process.argv[2] ?? '.env.local'
const go = process.argv.includes('--go')

function loadEnv(file: string): Record<string, string> {
  const out: Record<string, string> = {}
  let raw: string
  try {
    raw = readFileSync(resolve(process.cwd(), file), 'utf8')
  } catch {
    console.error(`✗ Não consegui ler ${file}. Passe o arquivo .env como 1º argumento.`)
    process.exit(1)
  }
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*([\w.]+)\s*=\s*(.*)\s*$/)
    if (!m) continue
    let val = m[2].trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    out[m[1]] = val
  }
  return out
}

const env = loadEnv(envFile)
const pick = (re: RegExp): string => {
  const k = Object.keys(env).find(name => re.test(name))
  return k ? env[k] : ''
}
const URL = (env.NEXT_PUBLIC_SUPABASE_URL || pick(/SUPABASE.*URL/i)).replace(/\/$/, '')
const KEY = env.SUPABASE_SERVICE_ROLE_KEY || pick(/SUPABASE.*SERVICE/i)

if (!URL || !KEY) {
  console.error(`✗ ${envFile} não tem NEXT_PUBLIC_SUPABASE_URL e/ou SUPABASE_SERVICE_ROLE_KEY.`)
  process.exit(1)
}

const H = { 'Content-Type': 'application/json', apikey: KEY, Authorization: 'Bearer ' + KEY }

async function rest(path: string, init?: RequestInit) {
  const r = await fetch(`${URL}/rest/v1${path}`, { ...init, headers: { ...H, ...init?.headers } })
  if (!r.ok) throw new Error(`${init?.method ?? 'GET'} ${path} → ${r.status}: ${await r.text()}`)
  const text = await r.text()
  return text ? JSON.parse(text) : null
}

interface ParsedRow {
  lab: 'Tecsa' | 'Hormonalle'
  categoria: string | null
  codigo: string | null
  nome: string | null
  cor_tubo: string | null
  material_tipo: string | null
  material_volume_ml: number | null
  especies: string | null
  prazo_dias_uteis: number | null
  custo: number | null
  preco_cliente: number | null
  sob_consulta: boolean
  is_combo: boolean
}

async function main() {
  const rows: ParsedRow[] = JSON.parse(
    readFileSync(resolve(__dirname, 'lab-exames.json'), 'utf-8'),
  )

  const labs: { id: number; nome: string }[] = await rest('/lab_laboratorios?select=id,nome')
  const labId = new Map(labs.map(l => [l.nome, l.id]))
  for (const nome of ['Tecsa', 'Hormonalle']) {
    if (!labId.has(nome)) {
      console.error(`✗ Laboratório '${nome}' não existe — rode a migration v39 antes.`)
      process.exit(1)
    }
  }

  // Dedup de códigos repetidos do PDF (mantém a 1ª ocorrência).
  const seen = new Set<string>()
  const dedup: ParsedRow[] = []
  const dropped: string[] = []
  for (const r of rows) {
    if (r.lab === 'Tecsa' && r.codigo) {
      const key = `${r.lab}:${r.codigo}`
      if (seen.has(key)) { dropped.push(`${r.codigo} (${r.nome})`); continue }
      seen.add(key)
    }
    if (!r.nome) { dropped.push(`sem nome (código ${r.codigo ?? '?'})`); continue }
    dedup.push(r)
  }

  const payload = dedup.map(r => ({
    laboratorio_id: labId.get(r.lab)!,
    codigo: r.codigo,
    nome: r.nome,
    categoria: r.categoria,
    cor_tubo: r.cor_tubo,
    material_tipo: r.material_tipo,
    material_volume_ml: r.material_volume_ml,
    especies: r.especies,
    prazo_dias_uteis: r.prazo_dias_uteis,
    custo: r.custo,
    preco_cliente: r.preco_cliente,
    preco_parceiro: null, // coluna "Vet e Clínica Parceira" está vazia no PDF
    is_combo: r.is_combo,
    sob_consulta: r.sob_consulta,
  }))

  // Pula o que já existe (reexecução segura após falha parcial).
  const chave = (p: { laboratorio_id: number; codigo: string | null; categoria: string | null; nome: string }) =>
    p.codigo ? `c:${p.laboratorio_id}:${p.codigo}` : `n:${p.laboratorio_id}:${p.categoria}:${p.nome}`
  const existentes: { laboratorio_id: number; codigo: string | null; categoria: string | null; nome: string }[] =
    await rest('/lab_exames?select=laboratorio_id,codigo,categoria,nome&limit=2000')
  const jaTem = new Set(existentes.map(chave))
  const faltantes = payload.filter(p => !jaTem.has(chave(p)))

  const porLab = (nome: string) => faltantes.filter(p => p.laboratorio_id === labId.get(nome)).length
  console.log(`Alvo: ${URL}`)
  console.log(`Catálogo: ${payload.length} exames · já no banco: ${existentes.length} · a inserir: ${faltantes.length} (Tecsa ${porLab('Tecsa')}, Hormonalle ${porLab('Hormonalle')})`)
  if (dropped.length) console.log(`Descartados (${dropped.length}): ${dropped.join('; ')}`)

  if (faltantes.length === 0) {
    console.log('✔ Nada a fazer — catálogo já importado.')
    return
  }

  if (!go) {
    console.log('\nDry-run (nada inserido). Rode com --go para importar.')
    return
  }

  // Insere em lotes de 200 para não estourar payload.
  for (let i = 0; i < faltantes.length; i += 200) {
    const lote = faltantes.slice(i, i + 200)
    await rest('/lab_exames', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(lote),
    })
    console.log(`  ${Math.min(i + 200, faltantes.length)}/${faltantes.length}`)
  }
  console.log('✔ Importação concluída.')
}

main().catch(e => { console.error(e); process.exit(1) })

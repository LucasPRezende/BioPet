/**
 * test-lab-excel.ts — smoke test do import de Excel do catálogo de labs:
 * lê um xlsx e mostra o diff contra o banco SEM aplicar nada (mesmo código
 * que /api/labs/exames/importar usa, via src/lib/lab-excel).
 *
 * Uso: npx tsx scripts/test-lab-excel.ts <arquivo.xlsx> [.env.local]
 */
import * as XLSX from 'xlsx'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { lerAba, diffCatalogo } from '../src/lib/lab-excel'

async function main() {
  const arquivo = process.argv[2]
  if (!arquivo) {
    console.error('Uso: npx tsx scripts/test-lab-excel.ts <arquivo.xlsx> [.env.local]')
    process.exit(1)
  }
  const envFile = process.argv[3] ?? '.env.local'
  const wb = XLSX.read(readFileSync(arquivo), { type: 'buffer' })
  const env = readFileSync(resolve(process.cwd(), envFile), 'utf8')
  const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)?.[1]?.trim()
  const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)?.[1]?.trim()
  if (!url || !key) { console.error(`✗ ${envFile} sem URL/service key.`); process.exit(1) }

  const H = { apikey: key, Authorization: 'Bearer ' + key }
  const labs: { id: number; nome: string }[] =
    await (await fetch(url + '/rest/v1/lab_laboratorios?select=id,nome', { headers: H })).json()
  const exames = await (await fetch(url + '/rest/v1/lab_exames?select=*&limit=5000', { headers: H })).json()
  console.log('abas:', wb.SheetNames.join(', '), '| banco:', exames.length, 'exames')

  const erros: string[] = []
  const porLab = wb.SheetNames.flatMap(aba => {
    const lab = labs.find(l => aba.toLowerCase().includes(l.nome.toLowerCase()))
    if (!lab) { erros.push(`Aba "${aba}" sem laboratório correspondente.`); return [] }
    return [{ lab: lab.nome, laboratorio_id: lab.id, linhas: lerAba(wb.Sheets[aba], erros, aba) }]
  })
  for (const p of porLab) console.log(`${p.lab}: ${p.linhas.length} linhas lidas`)

  const diff = diffCatalogo(porLab, exames, erros)
  console.log(`novos: ${diff.novos.length} | atualizados: ${diff.atualizados.length} | iguais: ${diff.iguais} | ausentes no excel: ${diff.ausentes.length} | avisos: ${diff.erros.length}`)
  console.log('--- amostra atualizados:')
  for (const a of diff.atualizados.slice(0, 10)) {
    console.log(` ${a.linha.codigo ?? ''} ${a.linha.nome.slice(0, 45)} -> ${a.mudancas.join(',')}`)
  }
  console.log('--- amostra novos:')
  for (const n of diff.novos.slice(0, 5)) console.log(` ${n.linha.codigo ?? ''} ${n.linha.nome.slice(0, 55)}`)
  console.log('--- amostra avisos:')
  for (const e of diff.erros.slice(0, 8)) console.log(' ' + e.slice(0, 110))
}

main().catch(e => { console.error(e); process.exit(1) })

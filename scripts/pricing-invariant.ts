/**
 * pricing-invariant.ts — diagnóstico (read-only) para a Fase 3.
 *
 * Encontra agendamentos que QUEBRAM o invariante `ag.valor === soma(agendamento_exames.valor)`,
 * que é o que os remendos (valorMismatch, useDetalhado, "bug legado clínica") hoje mascaram.
 * Categoriza para decidir o backfill SEM re-precificar cegamente (preços podem ter mudado;
 * registros pagos não devem ter o total alterado).
 *
 * Uso: npx tsx scripts/pricing-invariant.ts [.env.local] [limite]
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const envFile = process.argv[2] ?? '.env.local'
const limite  = Number(process.argv[3] ?? 5000)

const raw = readFileSync(resolve(process.cwd(), envFile), 'utf8')
const env: Record<string, string> = {}
for (const line of raw.split('\n')) {
  const m = line.match(/^\s*([\w.]+)\s*=\s*(.*)\s*$/)
  if (!m) continue
  let v = m[2].trim()
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
  env[m[1]] = v
}
const pick = (re: RegExp) => { const k = Object.keys(env).find(n => re.test(n)); return k ? env[k] : '' }
const URL = (env.NEXT_PUBLIC_SUPABASE_URL || pick(/SUPABASE.*URL/i)).replace(/\/$/, '')
const KEY = env.SUPABASE_SERVICE_ROLE_KEY || pick(/SUPABASE.*SERVICE/i) || pick(/SUPABASE.*ANON/i)
const H = { apikey: KEY, Authorization: 'Bearer ' + KEY }

async function get<T>(path: string): Promise<T> {
  const r = await fetch(`${URL}/rest/v1${path}`, { headers: H })
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`)
  return r.json() as Promise<T>
}
const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

interface ExameRow { tipo_exame: string; valor: number | null }
interface AgRow {
  id: number
  valor: number | null
  forma_pagamento: string | null
  status_pagamento: string | null
  clinica_id: number | null
  origem: string | null
  data_hora: string
  agendamento_exames: ExameRow[] | null
}

async function main() {
  const projeto = URL.replace('https://', '').split('.')[0]
  console.log(`\n🔬 Invariante ag.valor == soma(partes) — ${projeto} (${envFile}), até ${limite}\n`)

  const ags = await get<AgRow[]>(
    '/agendamentos?select=id,valor,forma_pagamento,status_pagamento,clinica_id,origem,data_hora,' +
      'agendamento_exames(tipo_exame,valor)' +
      `&order=id.desc&limit=${limite}`,
  )

  let consistentes = 0, gratuitos = 0, semExames = 0
  const quebrados: { ag: AgRow; soma: number; temZero: boolean }[] = []
  // "Zerados": consistentes (sum==ag.valor) mas o valor é 0 com exames pagáveis —
  // estes são os registros que a enrichment "bug legado clínica" mascara no GET.
  const zerados: { ag: AgRow }[] = []

  for (const ag of ags) {
    if ((ag.forma_pagamento ?? '').toLowerCase() === 'gratuito') { gratuitos++; continue }
    const exames = ag.agendamento_exames ?? []
    if (exames.length === 0) { semExames++; continue }

    const soma = exames.reduce((s, e) => s + Number(e.valor ?? 0), 0)
    const agv  = Number(ag.valor ?? 0)
    if (Math.abs(soma - agv) < 0.01) {
      consistentes++
      if (agv === 0) zerados.push({ ag })
      continue
    }

    quebrados.push({ ag, soma, temZero: exames.some(e => !e.valor || Number(e.valor) === 0) })
  }

  console.log(`Total analisados      : ${ags.length}`)
  console.log(`  ✓ consistentes      : ${consistentes}`)
  console.log(`  ⨯ quebram invariante: ${quebrados.length}`)
  console.log(`Ignorados:`)
  console.log(`  • gratuitos         : ${gratuitos}`)
  console.log(`  • sem exames        : ${semExames}`)

  if (quebrados.length > 0) {
    console.log(`\n⨯ Registros que quebram o invariante:\n`)
    for (const { ag, soma, temZero } of quebrados) {
      const ctx = [
        `ag#${ag.id}`,
        ag.clinica_id ? `clínica#${ag.clinica_id}` : 'tutor',
        `origem=${ag.origem}`,
        `pag=${ag.status_pagamento}`,
        `forma=${ag.forma_pagamento}`,
        ag.data_hora?.slice(0, 10),
      ].join(' • ')
      console.log(`  ${ctx}`)
      console.log(`    ag.valor=${brl(Number(ag.valor ?? 0))} vs soma(partes)=${brl(soma)}${temZero ? '  [tem exame com valor 0/null]' : ''}`)
      for (const e of ag.agendamento_exames ?? []) {
        console.log(`      - ${e.tipo_exame}: ${e.valor == null ? 'null' : brl(Number(e.valor))}`)
      }
    }

    // Resumo por status de pagamento (pagos NÃO devem ter o total mexido)
    const pagos = quebrados.filter(q => q.ag.status_pagamento === 'pago').length
    console.log(`\n⚠️  Dos quebrados, ${pagos} estão PAGOS (total não deve ser alterado) e ${quebrados.length - pagos} não-pagos.`)
  } else {
    console.log(`\n✅ Invariante (ag.valor == soma) íntegro — valorMismatch/useDetalhado nunca disparam.`)
  }

  // Zerados (alvos da enrichment "bug legado clínica")
  console.log(`\n── Zerados (valor 0 com exames pagáveis — mascarados pela enrichment no GET) ──`)
  console.log(`Total: ${zerados.length}`)
  for (const { ag } of zerados) {
    const ctx = [`ag#${ag.id}`, ag.clinica_id ? `clínica#${ag.clinica_id}` : 'tutor', `pag=${ag.status_pagamento}`, ag.data_hora?.slice(0, 10)].join(' • ')
    console.log(`  ${ctx} → exames: ${(ag.agendamento_exames ?? []).map(e => e.tipo_exame).join(', ')}`)
  }
}

main().catch(e => { console.error(e); process.exit(1) })

/**
 * pricing-equivalence.ts — prova de equivalência da FASE 0 da refatoração de pricing.
 *
 * Recalcula o preço de cada exame de uma amostra de agendamentos reais usando o
 * módulo canônico `src/lib/pricing.ts` e compara com o valor já gravado em
 * `agendamento_exames.valor` (+ desconto = bruto). Não escreve nada no banco.
 *
 * Uso:
 *   npx tsx scripts/pricing-equivalence.ts [.env.local] [limite]
 *   npx tsx scripts/pricing-equivalence.ts .env.prd.local 500
 *
 * O 1º argumento é o arquivo .env a carregar (default .env.local) — escolha
 * conscientemente entre dev (.env.dev.local) e prod (.env.prd.local). O 2º é o nº
 * máximo de agendamentos a checar (default 300, mais recentes primeiro).
 *
 * IMPORTANTE: divergências NÃO significam necessariamente bug. A tabela de preços
 * pode ter mudado depois do agendamento ter sido criado; nesse caso o valor gravado
 * (snapshot histórico) legitimamente difere do preço atual. O script classifica os
 * casos para o humano julgar.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  fromComissao,
  precoExame,
  precoBioquimica,
  formaEfetiva,
  isHorarioEspecial,
  type ComissaoRow,
} from '../src/lib/pricing'

// ── Carrega credenciais do arquivo .env escolhido ───────────────────────────────
const envFile = process.argv[2] ?? '.env.local'
const limite  = Number(process.argv[3] ?? 300)

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
// Aceita os nomes padrão (.env.local) e os prefixados dos arquivos dev/prd
// (SUPABASE_DEV_URL / SUPABASE_DEV_SERVICE), pegando o 1º que existir.
const pick = (re: RegExp): string => {
  const k = Object.keys(env).find(name => re.test(name))
  return k ? env[k] : ''
}
const URL = (env.NEXT_PUBLIC_SUPABASE_URL || pick(/SUPABASE.*URL/i)).replace(/\/$/, '')
const KEY =
  env.SUPABASE_SERVICE_ROLE_KEY ||
  pick(/SUPABASE.*SERVICE/i) ||
  env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||
  pick(/SUPABASE.*ANON/i)

if (!URL || !KEY) {
  console.error(`✗ ${envFile} não tem NEXT_PUBLIC_SUPABASE_URL e/ou SUPABASE_SERVICE_ROLE_KEY.`)
  process.exit(1)
}

const H = { 'Content-Type': 'application/json', apikey: KEY, Authorization: 'Bearer ' + KEY }

async function get<T>(path: string): Promise<T> {
  const r = await fetch(`${URL}/rest/v1${path}`, { headers: H })
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`)
  return r.json() as Promise<T>
}

function brl(n: number): string {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// ── Tipos das linhas do banco ───────────────────────────────────────────────────
interface ComissaoFull extends ComissaoRow {
  tipo_exame: string
}
interface ExameRow {
  tipo_exame: string
  valor: number | null
  desconto: number | null
  horario_especial: boolean | null
}
interface BioRow {
  valor_pix: number | null
  valor_cartao: number | null
}
interface AgRow {
  id: number
  forma_pagamento: string | null
  pagamento_responsavel: string | null
  valor: number | null
  data_hora: string
  encaixe: boolean | null
  duracao_minutos: number | null
  agendamento_exames: ExameRow[] | null
  agendamento_bioquimica: BioRow[] | null
}

async function main() {
  const projeto = URL.replace('https://', '').split('.')[0]
  console.log(`\n🔎 Equivalência de pricing — projeto ${projeto} (${envFile}), até ${limite} agendamentos\n`)

  // 1. Preços atuais
  const comissoes = await get<ComissaoFull[]>(
    '/comissoes_exame?select=tipo_exame,varia_por_horario,preco_pix_comercial,preco_cartao_comercial,preco_pix_fora_horario,preco_cartao_fora_horario',
  )
  const comMap = new Map(comissoes.map(c => [c.tipo_exame, c]))

  // 2. Amostra de agendamentos com exames + bioquímica
  const ags = await get<AgRow[]>(
    '/agendamentos?select=id,forma_pagamento,pagamento_responsavel,valor,data_hora,encaixe,duracao_minutos,' +
      'agendamento_exames(tipo_exame,valor,desconto,horario_especial),' +
      'agendamento_bioquimica(valor_pix,valor_cartao)' +
      `&order=id.desc&limit=${limite}`,
  )

  // 2b. Feriados + horário comercial (para recomputar o "especial" como o backend faz)
  const feriadosRows = await get<{ data: string }[]>('/feriados?select=data')
  const feriados = feriadosRows.map(f => f.data)
  const horarioRows = await get<{ key: string; value: string }[]>(
    '/system_config?select=key,value&key=in.(horario_especial_inicio,horario_especial_fim)',
  )
  const hmap = Object.fromEntries(horarioRows.map(r => [r.key, r.value]))
  const horarioInicio = hmap['horario_especial_inicio'] ?? '08:00'
  const horarioFim    = hmap['horario_especial_fim']    ?? '17:00'

  const especialRecalc = (ag: AgRow): boolean => {
    const [datePart, timePart = ''] = ag.data_hora.split('T')
    const hora = ag.encaixe ? '' : timePart.slice(0, 5)
    return isHorarioEspecial(hora, ag.duracao_minutos ?? 0, datePart, feriados, horarioFim, horarioInicio)
  }

  let ok = 0
  let gratuito = 0
  let semComissao = 0
  let semValor = 0
  const divergencias: string[] = []

  // Validação do "especial" recalculado vs o flag gravado
  let espOk = 0
  const espDiv: string[] = []

  for (const ag of ags) {
    const forma = formaEfetiva(ag.pagamento_responsavel, ag.forma_pagamento)
    const isGratuito = (ag.forma_pagamento ?? '').toLowerCase() === 'gratuito'

    // Compara o especial recalculado com o flag gravado nos exames do agendamento
    const espCalc = especialRecalc(ag)
    const exames = ag.agendamento_exames ?? []
    if (exames.length > 0) {
      const flagGravado = !!exames[0].horario_especial
      if (espCalc === flagGravado) espOk++
      else espDiv.push(`  ag#${ag.id} • ${ag.data_hora}${ag.encaixe ? ' (encaixe)' : ''} • dur=${ag.duracao_minutos} • recalc=${espCalc} vs gravado=${flagGravado}`)
    }

    for (const ex of ag.agendamento_exames ?? []) {
      if (isGratuito) { gratuito++; continue }
      if (ex.valor == null) { semValor++; continue }

      const brutoStored = Number(ex.valor) + Number(ex.desconto ?? 0)
      let calc: number

      if (ex.tipo_exame === 'Bioquímica') {
        const subs = (ag.agendamento_bioquimica ?? []).map(b => ({
          valor_pix:    Number(b.valor_pix ?? 0),
          valor_cartao: Number(b.valor_cartao ?? 0),
        }))
        calc = precoBioquimica(subs, forma)
      } else {
        const com = comMap.get(ex.tipo_exame)
        if (!com) { semComissao++; continue }
        calc = precoExame(fromComissao(com), { forma, especial: !!ex.horario_especial })
      }

      if (Math.abs(calc - brutoStored) < 0.01) {
        ok++
      } else {
        divergencias.push(
          `  ag#${ag.id} • ${ex.tipo_exame} • forma=${forma} • especial=${!!ex.horario_especial} • ` +
            `gravado(bruto)=${brl(brutoStored)} vs calculado=${brl(calc)}`,
        )
      }
    }
  }

  const total = ok + divergencias.length
  console.log(`Agendamentos analisados : ${ags.length}`)
  console.log(`Exames comparados       : ${total}`)
  console.log(`  ✓ equivalentes        : ${ok}`)
  console.log(`  ✗ divergentes         : ${divergencias.length}`)
  console.log(`Ignorados:`)
  console.log(`  • gratuitos           : ${gratuito}`)
  console.log(`  • sem valor gravado   : ${semValor}`)
  console.log(`  • tipo sem comissão   : ${semComissao}`)

  if (divergencias.length > 0) {
    console.log(`\n⚠️  Divergências (podem ser mudança de tabela de preço posterior ao agendamento):`)
    console.log(divergencias.slice(0, 60).join('\n'))
    if (divergencias.length > 60) console.log(`  ... e mais ${divergencias.length - 60}.`)
    const taxa = total > 0 ? ((ok / total) * 100).toFixed(1) : '0'
    console.log(`\nTaxa de equivalência: ${taxa}%`)
  } else {
    console.log(`\n✅ Equivalência total na amostra — pricing.ts reproduz 100% dos valores gravados.`)
  }

  // ── Validação do "especial" recalculado no backend ──────────────────────────────
  const espTotal = espOk + espDiv.length
  console.log(`\n── Horário especial recalculado vs flag gravado ──`)
  console.log(`Agendamentos com exames : ${espTotal}`)
  console.log(`  ✓ flag bate           : ${espOk}`)
  console.log(`  ✗ divergentes         : ${espDiv.length}`)
  if (espDiv.length > 0) {
    console.log(`\n⚠️  Divergências de especial (podem ser mudança de horário comercial/feriados/duração após o agendamento):`)
    console.log(espDiv.slice(0, 60).join('\n'))
    if (espDiv.length > 60) console.log(`  ... e mais ${espDiv.length - 60}.`)
    const taxaEsp = espTotal > 0 ? ((espOk / espTotal) * 100).toFixed(1) : '0'
    console.log(`\nTaxa de acerto do especial: ${taxaEsp}%`)
  } else {
    console.log(`\n✅ Especial recalculado bate 100% com o histórico.`)
  }
}

main().catch(e => { console.error(e); process.exit(1) })

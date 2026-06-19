/**
 * test-fase2.ts — teste de integração das funções de pricing no backend (Fase 2).
 * Valida precificarExames (recompute de preço E de horário especial a partir do
 * banco) e recalcularTotal contra o banco apontado pelo .env (default .env.local → dev).
 *
 * Uso: npx tsx scripts/test-fase2.ts [.env.local]
 *
 * precificarExames: lê comissoes + feriados + system_config (sem escrita).
 * recalcularTotal : escreve agendamentos.valor; o teste escolhe um agendamento já
 *                   consistente e verifica idempotência (restaura o mesmo valor).
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { isHorarioEspecial } from '../src/lib/pricing'

const envFile = process.argv[2] ?? '.env.local'
const raw = readFileSync(resolve(process.cwd(), envFile), 'utf8')
for (const line of raw.split('\n')) {
  const m = line.match(/^\s*([\w.]+)\s*=\s*(.*)\s*$/)
  if (!m) continue
  let v = m[2].trim()
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
  if (!process.env[m[1]]) process.env[m[1]] = v
}
const findVal = (re: RegExp) => { const k = Object.keys(process.env).find(n => re.test(n) && process.env[n]); return k ? process.env[k]! : '' }
process.env.NEXT_PUBLIC_SUPABASE_URL    ||= findVal(/SUPABASE.*URL/i)
process.env.SUPABASE_SERVICE_ROLE_KEY   ||= findVal(/SUPABASE.*SERVICE/i)

let pass = 0, fail = 0
function check(name: string, cond: boolean, extra = '') {
  if (cond) { pass++; console.log(`  ✓ ${name}`) }
  else { fail++; console.log(`  ✗ ${name} ${extra}`) }
}

async function main() {
  const { precificarExames, recalcularTotal } = await import('../src/lib/agendamento-helpers')
  const { supabase } = await import('../src/lib/supabase')

  console.log(`\n🧪 Teste Fase 2 — ${process.env.NEXT_PUBLIC_SUPABASE_URL?.replace('https://', '').split('.')[0]} (${envFile})\n`)

  // Feriados + horário comercial (para escolher datas deterministicamente)
  const { data: feriadosRows } = await supabase.from('feriados').select('data')
  const feriados = (feriadosRows ?? []).map((f: { data: string }) => f.data)
  const { data: horarioRows } = await supabase.from('system_config').select('key, value').in('key', ['horario_especial_inicio', 'horario_especial_fim'])
  const hmap = Object.fromEntries((horarioRows ?? []).map((r: { key: string; value: string }) => [r.key, r.value]))
  const inicio = hmap['horario_especial_inicio'] ?? '08:00'
  const fim    = hmap['horario_especial_fim']    ?? '17:00'

  // Data comercial: procura um dia útil (não feriado/fim de semana) ao meio-dia
  let dataComercial = ''
  for (let i = 1; i <= 21 && !dataComercial; i++) {
    const d = new Date(); d.setDate(d.getDate() + i)
    const iso = d.toISOString().slice(0, 10)
    if (!isHorarioEspecial('12:00', 30, iso, feriados, fim, inicio)) dataComercial = `${iso}T12:00:00`
  }
  // Data especial: mesmo dia útil, mas às 20h (depois do fim do horário comercial)
  const dataEspecial = dataComercial.replace('T12:00:00', 'T20:00:00')
  check('achou data comercial e especial deterministicamente', !!dataComercial && isHorarioEspecial('20:00', 30, dataEspecial.slice(0, 10), feriados, fim, inicio))

  // ── precificarExames ──────────────────────────────────────────────────────────
  console.log('precificarExames:')
  const { data: comissoes } = await supabase
    .from('comissoes_exame')
    .select('tipo_exame, varia_por_horario, preco_pix_comercial, preco_cartao_comercial, preco_pix_fora_horario, preco_cartao_fora_horario')
  const list = (comissoes ?? []) as Array<{
    tipo_exame: string; varia_por_horario: boolean
    preco_pix_comercial: number | null; preco_cartao_comercial: number | null
    preco_pix_fora_horario: number | null; preco_cartao_fora_horario: number | null
  }>

  const naoVaria = list.find(c => !c.varia_por_horario && c.tipo_exame !== 'Bioquímica' && (c.preco_pix_comercial ?? 0) > 0)
  const varia    = list.find(c => c.varia_por_horario && (c.preco_pix_fora_horario ?? 0) > 0 && c.preco_pix_fora_horario !== c.preco_pix_comercial)
  const semCartao = list.find(c => !c.varia_por_horario && c.preco_cartao_comercial == null && (c.preco_pix_comercial ?? 0) > 0)

  const base = { gratuito: false, bio: [], encaixe: false } as const

  if (naoVaria) {
    const r = await precificarExames([{ tipo_exame: naoVaria.tipo_exame, duracao_minutos: 30 }], { ...base, forma: 'pix', dataHora: dataComercial })
    check(`não-varia pix = preco_pix_comercial (${naoVaria.tipo_exame})`, r[0].valor === naoVaria.preco_pix_comercial, `→ ${r[0].valor} vs ${naoVaria.preco_pix_comercial}`)

    const desc = Math.min(10, naoVaria.preco_pix_comercial ?? 0)
    const rd = await precificarExames([{ tipo_exame: naoVaria.tipo_exame, duracao_minutos: 30, desconto: desc }], { ...base, forma: 'pix', dataHora: dataComercial })
    check('desconto aplicado (bruto − desconto)', rd[0].valor === (naoVaria.preco_pix_comercial ?? 0) - desc, `→ ${rd[0].valor}`)

    const rg = await precificarExames([{ tipo_exame: naoVaria.tipo_exame, duracao_minutos: 30 }], { ...base, gratuito: true, forma: 'pix', dataHora: dataComercial })
    check('gratuito → valor 0', rg[0].valor === 0)
  }

  if (varia) {
    const re = await precificarExames([{ tipo_exame: varia.tipo_exame, duracao_minutos: 30 }], { ...base, forma: 'pix', dataHora: dataEspecial })
    check(`varia + data especial pix = preco_pix_fora_horario (${varia.tipo_exame})`, re[0].valor === varia.preco_pix_fora_horario && re[0].horario_especial === true, `→ ${re[0].valor} vs ${varia.preco_pix_fora_horario}`)

    const rc = await precificarExames([{ tipo_exame: varia.tipo_exame, duracao_minutos: 30 }], { ...base, forma: 'pix', dataHora: dataComercial })
    check('varia + data comercial pix = preco_pix_comercial', rc[0].valor === varia.preco_pix_comercial && rc[0].horario_especial === false, `→ ${rc[0].valor} vs ${varia.preco_pix_comercial}`)

    // BRECHA FECHADA: cliente manda horario_especial=false numa data especial → backend ignora e cobra o especial
    const rh = await precificarExames([{ tipo_exame: varia.tipo_exame, duracao_minutos: 30, horario_especial: false }], { ...base, forma: 'pix', dataHora: dataEspecial })
    check('flag horario_especial do cliente é IGNORADO (cobra especial mesmo com flag=false)', rh[0].valor === varia.preco_pix_fora_horario && rh[0].horario_especial === true, `→ ${rh[0].valor} vs ${varia.preco_pix_fora_horario}`)
  } else {
    console.log('  (sem exame "varia_por_horario" com preço especial distinto — testes de especial pulados)')
  }

  if (semCartao) {
    const r = await precificarExames([{ tipo_exame: semCartao.tipo_exame, duracao_minutos: 30 }], { ...base, forma: 'cartao', dataHora: dataComercial })
    check(`cartão sem preço cai p/ pix (${semCartao.tipo_exame})`, r[0].valor === semCartao.preco_pix_comercial, `→ ${r[0].valor} vs ${semCartao.preco_pix_comercial}`)
  }

  const bio = [{ bioquimica_exame_id: 1, valor_pix: 40, valor_cartao: 50 }, { bioquimica_exame_id: 2, valor_pix: 30, valor_cartao: 35 }]
  const rb = await precificarExames([{ tipo_exame: 'Bioquímica', duracao_minutos: 15 }], { ...base, forma: 'pix', bio, dataHora: dataComercial })
  check('Bioquímica pix = soma valor_pix dos sub-exames', rb[0].valor === 70, `→ ${rb[0].valor}`)
  const rbc = await precificarExames([{ tipo_exame: 'Bioquímica', duracao_minutos: 15 }], { ...base, forma: 'cartao', bio, dataHora: dataComercial })
  check('Bioquímica cartão = soma valor_cartao dos sub-exames', rbc[0].valor === 85, `→ ${rbc[0].valor}`)

  // ── recalcularTotal (idempotência num agendamento consistente) ──────────────────
  console.log('\nrecalcularTotal:')
  const { data: ags } = await supabase
    .from('agendamentos')
    .select('id, valor, forma_pagamento, agendamento_exames(valor)')
    .neq('forma_pagamento', 'gratuito')
    .order('id', { ascending: false })
    .limit(200)

  const candidato = (ags ?? []).find(a => {
    const ex = (a as { agendamento_exames?: { valor: number | null }[] }).agendamento_exames ?? []
    if (ex.length === 0) return false
    const soma = ex.reduce((s, e) => s + Number(e.valor ?? 0), 0)
    return soma > 0 && Math.abs(soma - Number((a as { valor: number | null }).valor ?? 0)) < 0.01
  }) as { id: number; valor: number | null } | undefined

  if (candidato) {
    const antes = Number(candidato.valor)
    const total = await recalcularTotal(candidato.id)
    const { data: depois } = await supabase.from('agendamentos').select('valor').eq('id', candidato.id).single()
    check(`idempotente em ag#${candidato.id} (valor preservado = ${antes})`, total === antes && Number(depois?.valor) === antes, `→ retorno ${total}, gravado ${depois?.valor}`)
  } else {
    console.log('  (nenhum agendamento consistente encontrado p/ testar — pulado)')
  }

  console.log(`\nResultado: ${pass} ok, ${fail} falhas`)
  process.exit(fail > 0 ? 1 : 0)
}

main().catch(e => { console.error(e); process.exit(1) })

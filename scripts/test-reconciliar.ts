/**
 * test-reconciliar.ts — testa reconciliarLinkPagamento (decisão do "link desejado").
 * Cobre os ramos que não dependem do Mercado Pago: pix, nenhum, já-pago, no-op.
 * (O ramo cartão chama gerarPreferenciaMp, que no dev é recusado pelo token — testado
 * em prod / manualmente.) Usa um agendamento real do dev com snapshot + restore.
 *
 * Uso: npx tsx scripts/test-reconciliar.ts
 */
import { readFileSync } from 'node:fs'
const raw = readFileSync('.env.local', 'utf8')
for (const l of raw.split('\n')) { const m = l.match(/^\s*([\w.]+)\s*=\s*(.*)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '') }

let pass = 0, fail = 0
const check = (n: string, c: boolean, extra = '') => { if (c) { pass++; console.log(`  ✓ ${n}`) } else { fail++; console.log(`  ✗ ${n} ${extra}`) } }

async function main() {
  const { reconciliarLinkPagamento } = await import('../src/lib/agendamento-helpers')
  const { supabase } = await import('../src/lib/supabase')

  const { data: rows } = await supabase.from('agendamentos').select('id').order('id', { ascending: false }).limit(1)
  const id = rows![0].id as number
  console.log(`\n🧪 reconciliarLinkPagamento — usando ag#${id} (dev)\n`)

  const linkCols = 'mp_init_point, mp_preference_id, pix_token'
  const getLink = async () => (await supabase.from('agendamentos').select(linkCols).eq('id', id).single()).data as any
  const setLink = (f: Record<string, unknown>) => supabase.from('agendamentos').update(f).eq('id', id)
  const snap = await getLink()

  const base = (o: Record<string, unknown>) => ({
    forma_pagamento: null, entrega_pagamento: null, pagamento_responsavel: 'tutor',
    valor: 100, status_pagamento: 'a_receber', mp_preference_id: null, mp_init_point: null, pix_token: null, ...o,
  })

  try {
    // cartão → pix : gera link de pix
    await setLink({ mp_init_point: 'https://mp/old', mp_preference_id: null, pix_token: null })
    await reconciliarLinkPagamento(id,
      base({ forma_pagamento: 'cartao', entrega_pagamento: 'link', mp_init_point: 'https://mp/old' }),
      base({ forma_pagamento: 'pix', entrega_pagamento: 'link' }))
    let l = await getLink()
    check('cartão→pix gera link de pix', !!l.pix_token && (l.mp_init_point ?? '').includes('/pagamento/pix/'), `→ ${l.mp_init_point}`)

    // pix → presencial : limpa
    await setLink({ mp_init_point: 'https://x/pix', mp_preference_id: null, pix_token: 'tok' })
    await reconciliarLinkPagamento(id,
      base({ forma_pagamento: 'pix', entrega_pagamento: 'link', mp_init_point: 'https://x/pix', pix_token: 'tok' }),
      base({ forma_pagamento: 'pix', entrega_pagamento: 'presencial' }))
    l = await getLink()
    check('pix→presencial limpa o link', !l.mp_init_point && !l.pix_token && !l.mp_preference_id, `→ ${JSON.stringify(l)}`)

    // já pago : não mexe
    await setLink({ mp_init_point: 'https://keep', mp_preference_id: null, pix_token: 'keeptok' })
    await reconciliarLinkPagamento(id,
      base({ forma_pagamento: 'cartao', entrega_pagamento: 'link' }),
      base({ forma_pagamento: 'pix', entrega_pagamento: 'link', status_pagamento: 'pago' }))
    l = await getLink()
    check('já pago → não mexe no link', l.mp_init_point === 'https://keep' && l.pix_token === 'keeptok', `→ ${JSON.stringify(l)}`)

    // cartão → cartão, mesmo valor : mantém
    await setLink({ mp_init_point: 'https://keep2', mp_preference_id: null, pix_token: null })
    await reconciliarLinkPagamento(id,
      base({ forma_pagamento: 'cartao', entrega_pagamento: 'link', valor: 100, mp_init_point: 'https://keep2' }),
      base({ forma_pagamento: 'cartao', entrega_pagamento: 'link', valor: 100 }))
    l = await getLink()
    check('cartão→cartão mesmo valor → mantém', l.mp_init_point === 'https://keep2', `→ ${JSON.stringify(l)}`)

    // pix → pix : mantém (auto-valida)
    await setLink({ mp_init_point: 'https://x/pix2', mp_preference_id: null, pix_token: 'tok2' })
    await reconciliarLinkPagamento(id,
      base({ forma_pagamento: 'pix', entrega_pagamento: 'link', valor: 100, mp_init_point: 'https://x/pix2', pix_token: 'tok2' }),
      base({ forma_pagamento: 'pix', entrega_pagamento: 'link', valor: 200, mp_init_point: 'https://x/pix2', pix_token: 'tok2' }))
    l = await getLink()
    check('pix→pix (valor mudou) → mantém o link pix', l.mp_init_point === 'https://x/pix2' && l.pix_token === 'tok2', `→ ${JSON.stringify(l)}`)
  } finally {
    await setLink(snap)
    console.log(`\n(estado de ag#${id} restaurado)`)
  }

  console.log(`\nResultado: ${pass} ok, ${fail} falhas`)
  process.exit(fail > 0 ? 1 : 0)
}
main().catch(e => { console.error(e); process.exit(1) })

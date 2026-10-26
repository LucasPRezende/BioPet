import 'server-only'
import { supabase } from '@/lib/supabase'

// Faz exatamente `testesIds` apontarem para o consumível: vincula os marcados e
// solta os que apontavam para ele e foram desmarcados. Devolve a mensagem de erro ou null.
export async function vincularTestes(consumivelId: number, testesIds: unknown[]): Promise<string | null> {
  const ids = testesIds.map(Number).filter(n => Number.isInteger(n) && n > 0)

  let soltar = supabase.from('testes_rapidos').update({ consumivel_id: null }).eq('consumivel_id', consumivelId)
  if (ids.length > 0) soltar = soltar.not('id', 'in', `(${ids.join(',')})`)
  const { error: e1 } = await soltar
  if (e1) return e1.message

  if (ids.length > 0) {
    const { error: e2 } = await supabase.from('testes_rapidos').update({ consumivel_id: consumivelId }).in('id', ids)
    if (e2) return e2.message
  }
  return null
}

// Faz exatamente `pcrsIds` gastarem este consumível. Diferente do teste rápido,
// um PCR pode gastar vários consumíveis (ex.: "FIV e FeLV" usa o kit de FIV e o
// de FeLV), então só mexe nos vínculos DESTE consumível. Vínculo que continua
// mantém a quantidade; vínculo novo entra com 1.
export async function vincularPcrs(consumivelId: number, pcrsIds: unknown[]): Promise<string | null> {
  const ids = pcrsIds.map(Number).filter(n => Number.isInteger(n) && n > 0)

  let soltar = supabase.from('exame_pcr_consumiveis').delete().eq('consumivel_id', consumivelId)
  if (ids.length > 0) soltar = soltar.not('pcr_id', 'in', `(${ids.join(',')})`)
  const { error: e1 } = await soltar
  if (e1) return e1.message

  if (ids.length > 0) {
    const { error: e2 } = await supabase
      .from('exame_pcr_consumiveis')
      .upsert(ids.map(pcr_id => ({ pcr_id, consumivel_id: consumivelId, quantidade: 1 })),
              { onConflict: 'pcr_id,consumivel_id', ignoreDuplicates: true })
    if (e2) return e2.message
  }
  return null
}

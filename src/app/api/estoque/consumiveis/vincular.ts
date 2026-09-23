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

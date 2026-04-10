import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabase } from '@/lib/supabase'
import { parseVetSession } from '@/lib/vet-auth'

export async function GET() {
  const session = (await cookies()).get('vet_session')?.value
  if (!session) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })

  const vetId = await parseVetSession(session)
  if (!vetId) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })

  const { data, error } = await supabase
    .from('laudos')
    .select('id, nome_pet, especie, tutor, telefone, token, tipo, original_name, created_at')
    .eq('veterinario_id', vetId)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

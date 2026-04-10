import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabase } from '@/lib/supabase'
import { parseClinicaSession, CLINICA_COOKIE_NAME } from '@/lib/clinica-auth'

export async function GET() {
  const session = (await cookies()).get(CLINICA_COOKIE_NAME)?.value
  if (!session) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })

  const data = await parseClinicaSession(session)
  if (!data) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })

  const { clinicaId } = data

  const { data: vets, error } = await supabase
    .from('veterinarios')
    .select('id, nome, email, whatsapp, convite_aceito, criado_em')
    .eq('clinica_id', clinicaId)
    .order('nome')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Conta laudos por vet
  const vetIds = (vets ?? []).map(v => v.id)
  let laudosCounts: Record<number, number> = {}

  if (vetIds.length > 0) {
    const { data: counts } = await supabase
      .from('laudos')
      .select('veterinario_id')
      .in('veterinario_id', vetIds)

    for (const row of counts ?? []) {
      laudosCounts[row.veterinario_id] = (laudosCounts[row.veterinario_id] ?? 0) + 1
    }
  }

  const result = (vets ?? []).map(v => ({
    ...v,
    total_laudos: laudosCounts[v.id] ?? 0,
  }))

  return NextResponse.json(result)
}

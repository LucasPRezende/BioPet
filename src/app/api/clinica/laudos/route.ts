import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabase } from '@/lib/supabase'
import { parseClinicaSession, CLINICA_COOKIE_NAME } from '@/lib/clinica-auth'

export async function GET(request: NextRequest) {
  const session = (await cookies()).get(CLINICA_COOKIE_NAME)?.value
  if (!session) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })

  const data = await parseClinicaSession(session)
  if (!data) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })

  const { clinicaId } = data
  const { searchParams } = new URL(request.url)
  const busca    = searchParams.get('busca')?.trim()
  const vetId    = searchParams.get('vet_id')
  const tipo     = searchParams.get('tipo')
  const dataIni  = searchParams.get('data_ini')
  const dataFim  = searchParams.get('data_fim')

  // Busca veterinários vinculados à clínica
  const { data: vets, error: vetsError } = await supabase
    .from('veterinarios')
    .select('id')
    .eq('clinica_id', clinicaId)

  if (vetsError) return NextResponse.json({ error: vetsError.message }, { status: 500 })

  const vetIds = (vets ?? []).map(v => v.id)
  if (vetIds.length === 0) return NextResponse.json([])

  let query = supabase
    .from('laudos')
    .select('id, nome_pet, especie, tutor, tipo, original_name, token, created_at, veterinario_id')
    .in('veterinario_id', vetIds)
    .order('created_at', { ascending: false })

  if (busca) {
    query = query.or(`nome_pet.ilike.%${busca}%,tutor.ilike.%${busca}%`)
  }
  if (vetId) {
    query = query.eq('veterinario_id', parseInt(vetId))
  }
  if (tipo) {
    query = query.eq('tipo', tipo)
  }
  if (dataIni) {
    query = query.gte('created_at', dataIni)
  }
  if (dataFim) {
    query = query.lte('created_at', dataFim + 'T23:59:59')
  }

  const { data: laudos, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(laudos ?? [])
}

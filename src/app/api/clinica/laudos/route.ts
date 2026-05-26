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

  // Vet IDs vinculados à clínica
  const { data: vets, error: vetsError } = await supabase
    .from('veterinarios')
    .select('id')
    .eq('clinica_id', clinicaId)
  if (vetsError) return NextResponse.json({ error: vetsError.message }, { status: 500 })
  const vetIds = (vets ?? []).map(v => v.id)

  // Agendamento IDs da clínica (para incluir laudos gerados pelo admin)
  const { data: ags } = await supabase
    .from('agendamentos')
    .select('id')
    .eq('clinica_id', clinicaId)
  const agIds = (ags ?? []).map(a => a.id)

  if (vetIds.length === 0 && agIds.length === 0) return NextResponse.json([])

  const orParts: string[] = []
  if (vetIds.length > 0) orParts.push(`veterinario_id.in.(${vetIds.join(',')})`)
  if (agIds.length > 0)  orParts.push(`agendamento_id.in.(${agIds.join(',')})`)

  let query = supabase
    .from('laudos')
    .select('id, nome_pet, especie, tutor, tipo, original_name, token, criado_em, veterinario_id')
    .or(orParts.join(','))
    .order('criado_em', { ascending: false })

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
    query = query.gte('criado_em', dataIni)
  }
  if (dataFim) {
    query = query.lte('criado_em', dataFim + 'T23:59:59')
  }

  const { data: laudos, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(laudos ?? [])
}

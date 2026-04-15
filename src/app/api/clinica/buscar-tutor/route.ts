import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabase } from '@/lib/supabase'
import { parseClinicaSession, CLINICA_COOKIE_NAME } from '@/lib/clinica-auth'

export async function GET(request: NextRequest) {
  const token = (await cookies()).get(CLINICA_COOKIE_NAME)?.value
  if (!token) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
  const session = await parseClinicaSession(token)
  if (!session) return NextResponse.json({ error: 'Sessão inválida.' }, { status: 401 })

  const telefone = request.nextUrl.searchParams.get('telefone')
  if (!telefone) return NextResponse.json({ error: 'Parâmetro "telefone" é obrigatório.' }, { status: 400 })

  const digits  = telefone.replace(/\D/g, '')
  const telNorm = digits.startsWith('55') ? digits : `55${digits}`

  const { data: tutor } = await supabase
    .from('tutores')
    .select('id, nome, telefone')
    .or(`telefone.eq.${telNorm},telefone.eq.${digits}`)
    .maybeSingle()

  if (!tutor) return NextResponse.json({ tutor: null, pets: [] })

  const { data: pets } = await supabase
    .from('pets')
    .select('id, nome, especie, raca')
    .eq('tutor_id', tutor.id)
    .order('nome')

  return NextResponse.json({ tutor, pets: pets ?? [] })
}

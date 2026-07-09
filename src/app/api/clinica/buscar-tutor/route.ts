import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabase } from '@/lib/supabase'
import { parseClinicaSession, CLINICA_COOKIE_NAME } from '@/lib/clinica-auth'
import { sanitizeOrTerm } from '@/lib/search-utils'
import { normalizeTelefone } from '@/lib/telefone'

export async function GET(request: NextRequest) {
  const token = (await cookies()).get(CLINICA_COOKIE_NAME)?.value
  if (!token) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
  const session = await parseClinicaSession(token)
  if (!session) return NextResponse.json({ error: 'Sessão inválida.' }, { status: 401 })

  // Suporte a busca dinâmica por nome ou telefone (?q=) e busca direta por telefone (?telefone=)
  const q        = request.nextUrl.searchParams.get('q')?.trim() ?? ''
  const telParam = request.nextUrl.searchParams.get('telefone')?.trim() ?? ''
  const termo    = q || telParam

  if (!termo) return NextResponse.json([])

  const digits  = termo.replace(/\D/g, '')
  const telNorm = normalizeTelefone(digits)
  const isPhone = digits.length >= 8

  // Busca dinâmica — retorna lista
  if (q) {
    let query = supabase
      .from('tutores')
      .select('id, nome, telefone, pets(id, nome, especie, raca)')
      .order('nome')
      .limit(8)

    const qSafe = sanitizeOrTerm(q)
    if (isPhone) {
      query = query.or(`nome.ilike.%${qSafe}%,telefone.ilike.%${digits}%,telefone.ilike.%${telNorm}%`)
    } else {
      query = query.ilike('nome', `%${qSafe}%`)
    }

    const { data } = await query
    return NextResponse.json(data ?? [])
  }

  // Busca direta por telefone — retorna { tutor, pets } (compatibilidade)
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

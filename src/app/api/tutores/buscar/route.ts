import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { parseSystemSession, SESSION_COOKIE_NAME } from '@/lib/system-auth'

export async function GET(request: NextRequest) {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (!cookie) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  const session = await parseSystemSession(cookie)
  if (!session) return NextResponse.json({ error: 'Sessão inválida.' }, { status: 401 })

  const q = request.nextUrl.searchParams.get('q')?.trim() ?? ''
  if (q.length < 2) return NextResponse.json([])

  // Normaliza possível telefone digitado
  const digits = q.replace(/\D/g, '')
  const telNorm = digits.length >= 8 ? (digits.startsWith('55') ? digits : `55${digits}`) : null

  let query = supabase
    .from('tutores')
    .select('id, nome, telefone, pets(id, nome, especie, raca, sexo)')
    .order('nome')
    .limit(10)

  if (telNorm) {
    query = query.or(`nome.ilike.%${q}%,telefone.ilike.%${digits}%,telefone.ilike.%${telNorm}%`)
  } else {
    query = query.ilike('nome', `%${q}%`)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data ?? [])
}

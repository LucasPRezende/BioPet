import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { parseSystemSession, SESSION_COOKIE_NAME } from '@/lib/system-auth'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (!cookie) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  const session = await parseSystemSession(cookie)
  if (!session) return NextResponse.json({ error: 'Sessão inválida.' }, { status: 401 })

  const { id } = await params
  const petId = parseInt(id)
  if (isNaN(petId)) return NextResponse.json({ error: 'ID inválido.' }, { status: 400 })

  const body = await request.json()
  const nome    = body.nome?.trim()
  const especie = body.especie?.trim() || null
  const raca    = body.raca?.trim()    || null
  const sexo    = body.sexo?.trim()    || null

  if (!nome) return NextResponse.json({ error: 'Nome do pet é obrigatório.' }, { status: 400 })

  const { data, error } = await supabase
    .from('pets')
    .update({ nome, especie, raca, sexo })
    .eq('id', petId)
    .select('id, nome, especie, raca, sexo')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { parseSystemSession, SESSION_COOKIE_NAME } from '@/lib/system-auth'

async function autenticar(request: NextRequest) {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (!cookie) return null
  return parseSystemSession(cookie)
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await autenticar(request)
  if (!session) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const { id } = await params
  const petId = parseInt(id)
  if (isNaN(petId)) return NextResponse.json({ error: 'ID inválido.' }, { status: 400 })

  const { data: pet, error } = await supabase
    .from('pets')
    .select('id, nome, especie, raca, sexo, falecido, falecido_em, falecido_registrado_por, criado_em, tutores(id, nome, telefone)')
    .eq('id', petId)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!pet)  return NextResponse.json({ error: 'Pet não encontrado.' }, { status: 404 })

  const [laudosRes, agendamentosRes] = await Promise.all([
    supabase.from('laudos').select('id, created_at').eq('pet_id', petId).order('created_at'),
    supabase.from('agendamentos').select('id, data_hora').eq('pet_id', petId).order('data_hora'),
  ])

  const laudos       = laudosRes.data       ?? []
  const agendamentos = agendamentosRes.data  ?? []

  const datas = [...laudos.map(l => l.created_at), ...agendamentos.map(a => a.data_hora)].sort()

  return NextResponse.json({
    ...pet,
    total_laudos:        laudos.length,
    total_agendamentos:  agendamentos.length,
    primeiro_atendimento: datas[0]    ?? null,
    ultimo_atendimento:   datas[datas.length - 1] ?? null,
  })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await autenticar(request)
  if (!session) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

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

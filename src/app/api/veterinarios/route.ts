import { NextRequest, NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { supabase } from '@/lib/supabase'
import { parseSystemSession, SESSION_COOKIE_NAME } from '@/lib/system-auth'

export const dynamic = 'force-dynamic'
import { sendVetInvite } from '@/lib/evolution'

async function autenticar(request: NextRequest) {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (!cookie) return null
  return parseSystemSession(cookie)
}

export async function GET(request: NextRequest) {
  if (!(await autenticar(request))) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('veterinarios')
    .select('id, nome, email, whatsapp, convite_aceito, clinica_id, criado_em, clinicas(nome)')
    .order('criado_em', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(request: NextRequest) {
  if (!(await autenticar(request))) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  }

  const body = await request.json()
  const nome     = body.nome?.trim()
  const email    = body.email?.trim().toLowerCase() || null
  const whatsapp = body.whatsapp?.trim() || null

  if (!nome) {
    return NextResponse.json({ error: 'Nome é obrigatório.' }, { status: 400 })
  }

  // Checar unicidade de WhatsApp antes de inserir
  if (whatsapp) {
    const { data: existente } = await supabase
      .from('veterinarios')
      .select('id')
      .eq('whatsapp', whatsapp)
      .maybeSingle()
    if (existente) {
      return NextResponse.json({ error: 'Já existe um veterinário com este WhatsApp.' }, { status: 409 })
    }
  }

  const clinica_id    = body.clinica_id ? Number(body.clinica_id) : null
  const token_convite = uuidv4()

  const { data, error } = await supabase
    .from('veterinarios')
    .insert({ nome, email, whatsapp, token_convite, clinica_id })
    .select('id, nome, email, whatsapp, convite_aceito, token_convite, criado_em')
    .single()

  if (error) {
    const msg = error.message.includes('unique')
      ? 'Já existe um veterinário com este e-mail.'
      : error.message
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  if (whatsapp) {
    await sendVetInvite(whatsapp, nome, token_convite)
  }

  return NextResponse.json(data, { status: 201 })
}

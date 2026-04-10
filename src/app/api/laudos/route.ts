import { NextRequest, NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { supabase } from '@/lib/supabase'
import { parseSystemSession, SESSION_COOKIE_NAME } from '@/lib/system-auth'

const BUCKET = 'laudos'

async function getComissao(tipoExame: string | null) {
  if (!tipoExame) return { preco_exame: null, custo_exame: null, valor_comissao: null }
  const { data } = await supabase
    .from('comissoes_exame')
    .select('preco_exame, custo_exame, valor_comissao')
    .eq('tipo_exame', tipoExame)
    .single()
  return {
    preco_exame:    data?.preco_exame    ?? null,
    custo_exame:    data?.custo_exame    ?? null,
    valor_comissao: data?.valor_comissao ?? null,
  }
}

export async function GET(request: NextRequest) {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (!cookie) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const session = await parseSystemSession(cookie)
  if (!session) return NextResponse.json({ error: 'Sessão inválida.' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const busca   = searchParams.get('busca')?.trim()
  const tipo    = searchParams.get('tipo')
  const dataIni = searchParams.get('data_ini')
  const dataFim = searchParams.get('data_fim')
  const vetId   = searchParams.get('vet_id')

  let query = supabase
    .from('laudos')
    .select('*, veterinarios(nome), system_users(nome)')
    .order('created_at', { ascending: false })

  if (session.role !== 'admin') {
    query = query.eq('system_user_id', session.userId)
  }
  if (busca) query = query.or(`nome_pet.ilike.%${busca}%,tutor.ilike.%${busca}%,telefone.ilike.%${busca}%`)
  if (tipo)  query = query.eq('tipo', tipo)
  if (dataIni) query = query.gte('created_at', dataIni)
  if (dataFim) query = query.lte('created_at', dataFim + 'T23:59:59')
  if (vetId)   query = query.eq('veterinario_id', parseInt(vetId))

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(request: NextRequest) {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (!cookie) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const session = await parseSystemSession(cookie)
  if (!session) return NextResponse.json({ error: 'Sessão inválida.' }, { status: 401 })

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Falha ao processar o formulário.' }, { status: 400 })
  }

  const nomePet        = (formData.get('nome_pet')        as string)?.trim()
  const especie        = (formData.get('especie')         as string)?.trim()
  const tutor          = (formData.get('tutor')           as string)?.trim()
  const telefone       = (formData.get('telefone')        as string)?.trim()
  const veterinarioId  = (formData.get('veterinario_id')  as string)?.trim() || null
  const tipoExame      = (formData.get('tipo_exame')      as string)?.trim() || null
  const agendamentoId  = (formData.get('agendamento_id')  as string)?.trim() || null
  const tutorId        = (formData.get('tutor_id')        as string)?.trim() || null
  const petId          = (formData.get('pet_id')          as string)?.trim() || null
  const file           = formData.get('pdf') as File | null

  if (!nomePet || !especie || !tutor || !telefone || !file) {
    return NextResponse.json({ error: 'Todos os campos são obrigatórios.' }, { status: 400 })
  }

  if (file.type !== 'application/pdf') {
    return NextResponse.json({ error: 'O arquivo deve ser um PDF.' }, { status: 400 })
  }

  const token    = uuidv4()
  const filename = `${token}.pdf`
  const buffer   = Buffer.from(await file.arrayBuffer())

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(filename, buffer, { contentType: 'application/pdf' })

  if (uploadError) {
    return NextResponse.json({ error: `Erro ao salvar arquivo: ${uploadError.message}` }, { status: 500 })
  }

  // Impede laudo duplicado para o mesmo agendamento
  if (agendamentoId) {
    const { data: existente } = await supabase
      .from('laudos')
      .select('id')
      .eq('agendamento_id', Number(agendamentoId))
      .maybeSingle()
    if (existente) {
      return NextResponse.json({ error: 'Este agendamento já possui um laudo.' }, { status: 409 })
    }
  }

  // Snapshot dos valores financeiros vigentes
  const financeiro = await getComissao(tipoExame)

  const { data, error } = await supabase
    .from('laudos')
    .insert({
      nome_pet:       nomePet,
      especie,
      tutor,
      telefone,
      token,
      filename,
      original_name:  file.name,
      tipo:           'upload',
      veterinario_id: veterinarioId  ? Number(veterinarioId)  : null,
      tipo_exame:     tipoExame,
      system_user_id: session.userId,
      agendamento_id: agendamentoId  ? Number(agendamentoId)  : null,
      tutor_id:       tutorId        ? Number(tutorId)        : null,
      pet_id:         petId          ? Number(petId)          : null,
      ...financeiro,
    })
    .select('*, veterinarios(nome), system_users(nome)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Marca agendamento como concluído
  if (agendamentoId) {
    await supabase
      .from('agendamentos')
      .update({ status: 'concluído' })
      .eq('id', Number(agendamentoId))
  }

  return NextResponse.json(data, { status: 201 })
}

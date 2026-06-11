import { NextRequest, NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { supabase } from '@/lib/supabase'
import { parseSystemSession, SESSION_COOKIE_NAME } from '@/lib/system-auth'
import { savePdf, deletePdf } from '@/lib/pdf-storage'

async function getComissao(tipoExame: string | null, agendamentoId?: number | null) {
  if (!tipoExame) return { preco_exame: null, custo_exame: null, valor_comissao: null }
  const { data } = await supabase
    .from('comissoes_exame')
    .select('preco_pix_comercial, custo_exame, valor_comissao')
    .eq('tipo_exame', tipoExame)
    .single()

  // Usa o valor real cobrado no agendamento (já considera horário especial, clínica, etc.)
  // em vez do preço comercial padrão da tabela
  let precoExame: number | null = data?.preco_pix_comercial ?? null
  if (agendamentoId) {
    const { data: agExame } = await supabase
      .from('agendamento_exames')
      .select('valor')
      .eq('agendamento_id', agendamentoId)
      .eq('tipo_exame', tipoExame)
      .maybeSingle()
    if (agExame?.valor != null) precoExame = Number(agExame.valor)
  }

  return {
    preco_exame:    precoExame,
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
    .order('criado_em', { ascending: false })

  if (session.role !== 'admin') {
    query = query.eq('system_user_id', session.userId)
  }
  if (busca) query = query.or(`nome_pet.ilike.%${busca}%,tutor.ilike.%${busca}%,telefone.ilike.%${busca}%`)
  if (tipo)  query = query.eq('tipo', tipo)
  if (dataIni) query = query.gte('criado_em', dataIni)
  if (dataFim) query = query.lte('criado_em', dataFim + 'T23:59:59')
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

  // Impede laudo duplicado para o mesmo agendamento+tipo_exame
  if (agendamentoId) {
    if (tipoExame) {
      // Verifica quantos laudos já existem para este tipo_exame neste agendamento
      const { data: laudosDoTipo } = await supabase
        .from('laudos')
        .select('id')
        .eq('agendamento_id', Number(agendamentoId))
        .eq('tipo_exame', tipoExame)
      // Verifica quantas rows de agendamento_exames existem para este tipo_exame
      const { data: examesDoTipo } = await supabase
        .from('agendamento_exames')
        .select('id')
        .eq('agendamento_id', Number(agendamentoId))
        .eq('tipo_exame', tipoExame)
      const laudosCount = (laudosDoTipo ?? []).length
      const examesCount = Math.max(1, (examesDoTipo ?? []).length)
      if (laudosCount >= examesCount) {
        return NextResponse.json({ error: 'Este agendamento já possui um laudo para este exame.' }, { status: 409 })
      }
    } else {
      // Sem tipo_exame — comportamento legado: bloqueia qualquer laudo duplicado
      const { data: existente } = await supabase
        .from('laudos')
        .select('id')
        .eq('agendamento_id', Number(agendamentoId))
        .maybeSingle()
      if (existente) {
        return NextResponse.json({ error: 'Este agendamento já possui um laudo.' }, { status: 409 })
      }
    }
  }

  const token    = uuidv4()
  const filename = `${token}.pdf`
  const buffer   = Buffer.from(await file.arrayBuffer())

  try {
    await savePdf(filename, buffer)
  } catch {
    return NextResponse.json({ error: 'Erro ao salvar arquivo no servidor.' }, { status: 500 })
  }

  // Snapshot dos valores financeiros vigentes
  const financeiro = await getComissao(tipoExame, agendamentoId ? Number(agendamentoId) : null)

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

  if (error) {
    await deletePdf(filename)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Marca agendamento como concluído apenas quando todos os laudos foram emitidos
  if (agendamentoId) {
    const agId = Number(agendamentoId)
    const [{ data: totalLaudos }, { data: totalExames }] = await Promise.all([
      supabase.from('laudos').select('id').eq('agendamento_id', agId),
      supabase.from('agendamento_exames').select('id').eq('agendamento_id', agId),
    ])
    const laudosTotal = totalLaudos?.length ?? 0
    const examesTotal = Math.max(1, totalExames?.length ?? 0)
    if (laudosTotal >= examesTotal) {
      await supabase.from('agendamentos').update({ status: 'concluído' }).eq('id', agId)
    }
  }

  return NextResponse.json(data, { status: 201 })
}

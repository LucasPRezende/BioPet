import { NextRequest, NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { supabase } from '@/lib/supabase'
import { parseSystemSession, SESSION_COOKIE_NAME } from '@/lib/system-auth'
import { generateBioquimicaPDF, type BioquimicaPDFData } from '@/lib/generate-bioquimica-pdf'

const BUCKET = 'laudos'

async function getComissao() {
  const { data } = await supabase
    .from('comissoes_exame')
    .select('preco_exame, custo_exame, valor_comissao')
    .eq('tipo_exame', 'Bioquímica')
    .single()
  return {
    preco_exame:    data?.preco_exame    ?? null,
    custo_exame:    data?.custo_exame    ?? null,
    valor_comissao: data?.valor_comissao ?? null,
  }
}

export async function POST(request: NextRequest) {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (!cookie) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const session = await parseSystemSession(cookie)
  if (!session) return NextResponse.json({ error: 'Sessão inválida.' }, { status: 401 })

  let body: {
    pdfData:        BioquimicaPDFData
    tutor:          string
    telefone:       string
    sexo:           string
    raca:           string
    medico_responsavel: string
    data_laudo:     string
    veterinario_id: number | null
    tutor_id:       number | null
    pet_id:         number | null
    agendamento_id: number | null
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 })
  }

  const { pdfData, tutor, telefone, sexo, raca, medico_responsavel, data_laudo,
          veterinario_id, tutor_id, pet_id, agendamento_id } = body

  if (!pdfData?.nome_pet || !pdfData?.especie || !tutor || !telefone) {
    return NextResponse.json({ error: 'Campos obrigatórios ausentes.' }, { status: 400 })
  }
  if (!pdfData.resultados?.length) {
    return NextResponse.json({ error: 'Nenhum resultado informado.' }, { status: 400 })
  }

  // Prevent duplicate laudo for same agendamento
  if (agendamento_id) {
    const { data: existente } = await supabase
      .from('laudos')
      .select('id')
      .eq('agendamento_id', agendamento_id)
      .maybeSingle()
    if (existente) {
      return NextResponse.json({ error: 'Este agendamento já possui um laudo.' }, { status: 409 })
    }
  }

  try {
    const pdfBuffer    = await generateBioquimicaPDF(pdfData)
    const token        = uuidv4()
    const filename     = `${token}.pdf`
    const originalName = `laudo_bioquimica_${pdfData.nome_pet.replace(/\s+/g, '_')}.pdf`

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(filename, pdfBuffer, { contentType: 'application/pdf' })

    if (uploadError) throw new Error(`Erro ao salvar arquivo: ${uploadError.message}`)

    const financeiro = await getComissao()

    const { data, error } = await supabase
      .from('laudos')
      .insert({
        nome_pet:           pdfData.nome_pet,
        especie:            pdfData.especie,
        tutor,
        telefone,
        token,
        filename,
        original_name:      originalName,
        tipo:               'gerado',
        sexo,
        raca,
        medico_responsavel,
        idade:              pdfData.idade,
        data_laudo,
        texto:              JSON.stringify(pdfData.resultados),
        veterinario_id,
        tipo_exame:         'Bioquímica',
        system_user_id:     session.userId,
        agendamento_id,
        tutor_id,
        pet_id,
        ...financeiro,
      })
      .select('*, veterinarios(nome), system_users(nome)')
      .single()

    if (error) throw new Error(error.message)

    if (agendamento_id) {
      await supabase
        .from('agendamentos')
        .update({ status: 'concluído' })
        .eq('id', agendamento_id)
    }

    return NextResponse.json(data, { status: 201 })
  } catch (err) {
    console.error('[gerar-bioquimica] erro:', err)
    const msg = err instanceof Error ? err.message : 'Erro desconhecido'
    return NextResponse.json({ error: `Falha ao gerar o PDF: ${msg}` }, { status: 500 })
  }
}

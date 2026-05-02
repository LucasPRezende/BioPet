import { NextRequest, NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { supabase } from '@/lib/supabase'
import { generateLaudoPDF, type LaudoFormData } from '@/lib/generate-pdf'
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

  const get = (k: string) => (formData.get(k) as string | null)?.trim() ?? ''

  const nomePet           = get('nome_pet')
  const especie           = get('especie')
  const tutor             = get('tutor')
  const telefone          = get('telefone')
  const sexo              = get('sexo')
  const raca              = get('raca')
  const medicoResponsavel = get('medico_responsavel')
  const idade             = get('idade')
  const dataLaudo         = get('data_laudo')
  const texto             = get('texto')
  const tipoExame         = get('tipo_exame') || null
  const veterinarioIdRaw  = get('veterinario_id')
  const veterinarioId     = veterinarioIdRaw ? Number(veterinarioIdRaw) : null
  const agendamentoIdRaw  = get('agendamento_id')
  const agendamentoId     = agendamentoIdRaw ? Number(agendamentoIdRaw) : null
  const tutorIdRaw        = get('tutor_id')
  const tutorId           = tutorIdRaw ? Number(tutorIdRaw) : null
  const petIdRaw          = get('pet_id')
  const petId             = petIdRaw ? Number(petIdRaw) : null

  if (!nomePet || !especie || !tutor || !telefone || !texto) {
    return NextResponse.json({ error: 'Preencha todos os campos obrigatórios.' }, { status: 400 })
  }

  const imagensBuffers: Buffer[] = []
  for (const img of formData.getAll('imagens') as File[]) {
    if (img && img.size > 0) {
      imagensBuffers.push(Buffer.from(await img.arrayBuffer()))
    }
  }

  const laudoData: LaudoFormData = {
    animal:             nomePet,
    especie,
    proprietario:       tutor,
    sexo,
    raca,
    medico_responsavel: medicoResponsavel || 'Luciana Pereira de Brites',
    idade,
    data:               dataLaudo || new Date().toLocaleDateString('pt-BR'),
    texto,
    tipo_exame:         tipoExame ?? undefined,
  }

  // Impede laudo duplicado para o mesmo agendamento
  if (agendamentoId) {
    const { data: existente } = await supabase
      .from('laudos')
      .select('id')
      .eq('agendamento_id', agendamentoId)
      .maybeSingle()
    if (existente) {
      return NextResponse.json({ error: 'Este agendamento já possui um laudo.' }, { status: 409 })
    }
  }

  try {
    const pdfBuffer    = await generateLaudoPDF(laudoData, imagensBuffers)
    const token        = uuidv4()
    const filename     = `${token}.pdf`
    const originalName = `laudo_${nomePet.replace(/\s+/g, '_')}.pdf`

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(filename, pdfBuffer, { contentType: 'application/pdf' })

    if (uploadError) throw new Error(`Erro ao salvar arquivo: ${uploadError.message}`)

    // Snapshot dos valores financeiros vigentes
    const financeiro = await getComissao(tipoExame)

    const { data, error } = await supabase
      .from('laudos')
      .insert({
        nome_pet:           nomePet,
        especie,
        tutor,
        telefone,
        token,
        filename,
        original_name:      originalName,
        tipo:               'gerado',
        sexo,
        raca,
        medico_responsavel: medicoResponsavel,
        idade,
        data_laudo:         dataLaudo,
        texto,
        veterinario_id:     veterinarioId,
        tipo_exame:         tipoExame,
        system_user_id:     session.userId,
        agendamento_id:     agendamentoId,
        tutor_id:           tutorId,
        pet_id:             petId,
        ...financeiro,
      })
      .select('*, veterinarios(nome), system_users(nome)')
      .single()

    if (error) {
      await supabase.storage.from(BUCKET).remove([filename])
      throw new Error(error.message)
    }

    // Marca agendamento como concluído
    if (agendamentoId) {
      await supabase
        .from('agendamentos')
        .update({ status: 'concluído' })
        .eq('id', agendamentoId)
    }

    return NextResponse.json(data, { status: 201 })
  } catch (err) {
    console.error('[gerar PDF] erro:', err)
    const msg = err instanceof Error ? err.message : 'Erro desconhecido'
    return NextResponse.json({ error: `Falha ao gerar o PDF: ${msg}` }, { status: 500 })
  }
}

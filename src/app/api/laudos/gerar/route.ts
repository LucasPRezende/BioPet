import { NextRequest, NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { supabase } from '@/lib/supabase'
import { generateLaudoPDF, type LaudoFormData } from '@/lib/generate-pdf'

const BUCKET = 'laudos'

export async function POST(request: NextRequest) {
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

  if (!nomePet || !especie || !tutor || !telefone || !texto) {
    return NextResponse.json({ error: 'Preencha todos os campos obrigatórios.' }, { status: 400 })
  }

  const imagensBuffers: Buffer[] = []
  const imagens = formData.getAll('imagens') as File[]
  for (const img of imagens) {
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
  }

  try {
    const pdfBuffer = await generateLaudoPDF(laudoData, imagensBuffers)

    const token        = uuidv4()
    const filename     = `${token}.pdf`
    const originalName = `laudo_${nomePet.replace(/\s+/g, '_')}.pdf`

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(filename, pdfBuffer, { contentType: 'application/pdf' })

    if (uploadError) throw new Error(`Erro ao salvar arquivo: ${uploadError.message}`)

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
      })
      .select()
      .single()

    if (error) throw new Error(error.message)

    return NextResponse.json(data, { status: 201 })
  } catch (err) {
    console.error('[gerar PDF] erro:', err)
    const msg = err instanceof Error ? err.message : 'Erro desconhecido'
    return NextResponse.json({ error: `Falha ao gerar o PDF: ${msg}` }, { status: 500 })
  }
}

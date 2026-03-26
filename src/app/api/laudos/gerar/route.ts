import { NextRequest, NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import path from 'path'
import fs from 'fs'
import db from '@/lib/db'
import { generateLaudoPDF, type LaudoFormData } from '@/lib/generate-pdf'

const UPLOADS_DIR = path.join(process.cwd(), 'uploads')

export async function POST(request: NextRequest) {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true })
  }

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

  // Imagens (múltiplas)
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
    const filePath     = path.join(UPLOADS_DIR, filename)
    const originalName = `laudo_${nomePet.replace(/\s+/g, '_')}.pdf`

    fs.writeFileSync(filePath, pdfBuffer)

    const result = db
      .prepare(
        `INSERT INTO laudos
           (nome_pet, especie, tutor, telefone, token, filename, original_name,
            tipo, sexo, raca, medico_responsavel, idade, data_laudo, texto)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      )
      .run(
        nomePet, especie, tutor, telefone, token, filename, originalName,
        'gerado', sexo, raca, medicoResponsavel, idade, dataLaudo, texto
      )

    const laudo = db.prepare('SELECT * FROM laudos WHERE id = ?').get(result.lastInsertRowid)
    return NextResponse.json(laudo, { status: 201 })
  } catch (err) {
    console.error('[gerar PDF] erro:', err)
    const msg = err instanceof Error ? err.message : 'Erro desconhecido'
    return NextResponse.json({ error: `Falha ao gerar o PDF: ${msg}` }, { status: 500 })
  }
}

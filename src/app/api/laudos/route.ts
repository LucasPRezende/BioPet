import { NextRequest, NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import path from 'path'
import fs from 'fs'
import db from '@/lib/db'

const UPLOADS_DIR = path.join(process.cwd(), 'uploads')

export async function GET() {
  const laudos = db.prepare('SELECT * FROM laudos ORDER BY created_at DESC').all()
  return NextResponse.json(laudos)
}

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

  const nomePet = (formData.get('nome_pet') as string)?.trim()
  const especie = (formData.get('especie') as string)?.trim()
  const tutor = (formData.get('tutor') as string)?.trim()
  const telefone = (formData.get('telefone') as string)?.trim()
  const file = formData.get('pdf') as File | null

  if (!nomePet || !especie || !tutor || !telefone || !file) {
    return NextResponse.json({ error: 'Todos os campos são obrigatórios.' }, { status: 400 })
  }

  if (file.type !== 'application/pdf') {
    return NextResponse.json({ error: 'O arquivo deve ser um PDF.' }, { status: 400 })
  }

  const token = uuidv4()
  const filename = `${token}.pdf`
  const filePath = path.join(UPLOADS_DIR, filename)

  const buffer = Buffer.from(await file.arrayBuffer())
  fs.writeFileSync(filePath, buffer)

  const result = db
    .prepare(
      `INSERT INTO laudos (nome_pet, especie, tutor, telefone, token, filename, original_name)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(nomePet, especie, tutor, telefone, token, filename, file.name)

  const laudo = db.prepare('SELECT * FROM laudos WHERE id = ?').get(result.lastInsertRowid)

  return NextResponse.json(laudo, { status: 201 })
}

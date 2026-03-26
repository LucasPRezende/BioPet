import { NextRequest, NextResponse } from 'next/server'
import path from 'path'
import fs from 'fs'
import db from '@/lib/db'

interface Laudo {
  filename: string
  original_name: string
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const laudo = db
    .prepare('SELECT filename, original_name FROM laudos WHERE id = ?')
    .get(params.id) as Laudo | undefined

  if (!laudo) {
    return NextResponse.json({ error: 'Laudo não encontrado.' }, { status: 404 })
  }

  const filePath = path.join(process.cwd(), 'uploads', laudo.filename)

  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: 'Arquivo não encontrado no servidor.' }, { status: 404 })
  }

  const fileBuffer = fs.readFileSync(filePath)
  const isDownload = request.nextUrl.searchParams.get('download') === '1'

  return new NextResponse(fileBuffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': isDownload
        ? `attachment; filename="${laudo.original_name}"`
        : `inline; filename="${laudo.original_name}"`,
      'Cache-Control': 'private, max-age=3600',
    },
  })
}

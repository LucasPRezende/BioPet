import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { readPdf } from '@/lib/pdf-storage'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params

  if (!token || token.length < 10) {
    return NextResponse.json({ error: 'Token inválido.' }, { status: 400 })
  }

  const { data: laudo, error } = await supabase
    .from('laudos')
    .select('filename, original_name')
    .eq('token', token)
    .single()

  if (error || !laudo) {
    return NextResponse.json({ error: 'Laudo não encontrado.' }, { status: 404 })
  }

  const buffer = await readPdf(laudo.filename)
  if (!buffer) {
    return NextResponse.json({ error: 'Arquivo não encontrado.' }, { status: 404 })
  }

  const isDownload = request.nextUrl.searchParams.get('download') === '1'
  const disposition = isDownload
    ? `attachment; filename="${laudo.original_name}"`
    : 'inline'

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type':        'application/pdf',
      'Content-Disposition': disposition,
      'Cache-Control':       'private, no-store',
    },
  })
}

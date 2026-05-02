import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

const BUCKET = 'laudos'
const SIGNED_URL_EXPIRY = 3600 // 1 hora

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

  // Signed URL de curta duração — não expõe bucket público
  const { data: signed, error: signErr } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(laudo.filename, SIGNED_URL_EXPIRY)

  if (signErr || !signed?.signedUrl) {
    return NextResponse.json({ error: 'Arquivo não disponível.' }, { status: 500 })
  }

  const isDownload = request.nextUrl.searchParams.get('download') === '1'

  if (!isDownload) {
    return NextResponse.redirect(signed.signedUrl)
  }

  // Para download: proxy com nome de arquivo correto
  const res = await fetch(signed.signedUrl)
  if (!res.ok) {
    return NextResponse.json({ error: 'Arquivo não encontrado no storage.' }, { status: 404 })
  }

  const buffer = Buffer.from(await res.arrayBuffer())
  return new NextResponse(buffer, {
    headers: {
      'Content-Type':        'application/pdf',
      'Content-Disposition': `attachment; filename="${laudo.original_name}"`,
      'Cache-Control':       'private, no-store',
    },
  })
}

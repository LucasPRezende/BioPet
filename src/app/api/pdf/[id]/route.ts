import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

const BUCKET = 'laudos'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { data: laudo, error } = await supabase
    .from('laudos')
    .select('filename, original_name')
    .eq('id', params.id)
    .single()

  if (error || !laudo) {
    return NextResponse.json({ error: 'Laudo não encontrado.' }, { status: 404 })
  }

  const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(laudo.filename)

  const isDownload = request.nextUrl.searchParams.get('download') === '1'

  if (!isDownload) {
    return NextResponse.redirect(publicUrl)
  }

  // For download: proxy the file so we can set the correct filename
  const res = await fetch(publicUrl)
  if (!res.ok) {
    return NextResponse.json({ error: 'Arquivo não encontrado no storage.' }, { status: 404 })
  }

  const buffer = Buffer.from(await res.arrayBuffer())
  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${laudo.original_name}"`,
      'Cache-Control': 'private, max-age=3600',
    },
  })
}

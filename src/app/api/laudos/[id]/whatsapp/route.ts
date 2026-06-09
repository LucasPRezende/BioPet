import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { parseSystemSession, SESSION_COOKIE_NAME } from '@/lib/system-auth'
import { sendWhatsAppDocument } from '@/lib/evolution'

const BUCKET = 'laudos'

function randomDelay() {
  const ms = Math.floor(Math.random() * 6000) + 4000 // 4–10 segundos
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const cookie = req.cookies.get(SESSION_COOKIE_NAME)?.value
  if (!cookie) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  const session = await parseSystemSession(cookie)
  if (!session) {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })
  }

  const id = Number(params.id)
  if (!id) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })

  let destino: 'tutor' | 'vet' | 'ambos' = 'ambos'
  try {
    const body = await req.json()
    if (body?.destino === 'tutor' || body?.destino === 'vet') destino = body.destino
  } catch { /* body vazio = ambos */ }

  const { data: laudo, error } = await supabase
    .from('laudos')
    .select('nome_pet, tutor, telefone, filename, original_name, veterinarios(whatsapp)')
    .eq('id', id)
    .single()

  if (error || !laudo) return NextResponse.json({ error: 'Laudo não encontrado' }, { status: 404 })
  if (!laudo.filename)  return NextResponse.json({ error: 'Laudo sem arquivo.' }, { status: 422 })

  const { data: signed, error: signErr } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(laudo.filename, 3600)

  if (signErr || !signed?.signedUrl) {
    return NextResponse.json({ error: 'Não foi possível gerar o link do PDF.' }, { status: 500 })
  }

  const fileName     = laudo.original_name ?? `laudo_${laudo.nome_pet}.pdf`
  const vetWhatsapp  = (laudo.veterinarios as unknown as { whatsapp: string | null } | null)?.whatsapp

  if (destino === 'tutor' || destino === 'ambos') {
    const ok = await sendWhatsAppDocument(
      laudo.telefone,
      signed.signedUrl,
      fileName,
      `Olá! O laudo do *${laudo.nome_pet}* está pronto. Segue o PDF.`,
    )
    if (!ok) return NextResponse.json({ error: 'Falha ao enviar para o tutor' }, { status: 502 })
  }

  if ((destino === 'vet' || destino === 'ambos') && vetWhatsapp) {
    if (destino === 'ambos') await randomDelay()
    await sendWhatsAppDocument(
      vetWhatsapp,
      signed.signedUrl,
      fileName,
      `Segue o PDF do laudo do *${laudo.nome_pet}* (tutor: ${laudo.tutor}).`,
    )
  }

  return NextResponse.json({ ok: true })
}

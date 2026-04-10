import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { parseSystemSession, SESSION_COOKIE_NAME } from '@/lib/system-auth'

const BUCKET = 'laudos'

// PATCH — substitui o PDF de um laudo existente
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (!cookie) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const session = await parseSystemSession(cookie)
  if (!session) return NextResponse.json({ error: 'Sessão inválida.' }, { status: 401 })

  // Busca laudo existente
  const { data: laudo } = await supabase
    .from('laudos')
    .select('id, filename')
    .eq('id', Number(params.id))
    .single()

  if (!laudo) return NextResponse.json({ error: 'Laudo não encontrado.' }, { status: 404 })

  let formData: FormData
  try { formData = await request.formData() }
  catch { return NextResponse.json({ error: 'Falha ao processar o formulário.' }, { status: 400 }) }

  const file = formData.get('pdf') as File | null
  if (!file) return NextResponse.json({ error: 'Arquivo PDF é obrigatório.' }, { status: 400 })
  if (file.type !== 'application/pdf') return NextResponse.json({ error: 'O arquivo deve ser um PDF.' }, { status: 400 })

  const buffer = Buffer.from(await file.arrayBuffer())

  // Substitui o arquivo no Storage (mesmo filename)
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .update(laudo.filename, buffer, { contentType: 'application/pdf', upsert: true })

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })

  // Atualiza o nome original
  await supabase
    .from('laudos')
    .update({ original_name: file.name })
    .eq('id', laudo.id)

  return NextResponse.json({ ok: true })
}

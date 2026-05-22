import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { parseSystemSession, SESSION_COOKIE_NAME } from '@/lib/system-auth'
import { sendWhatsAppText } from '@/lib/evolution'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const cookie = req.cookies.get(SESSION_COOKIE_NAME)?.value
  if (!cookie) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  const session = await parseSystemSession(cookie)
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })
  }

  const id = Number(params.id)
  if (!id) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })

  const { data: laudo, error } = await supabase
    .from('laudos')
    .select('nome_pet, telefone, token')
    .eq('id', id)
    .single()

  if (error || !laudo) return NextResponse.json({ error: 'Laudo não encontrado' }, { status: 404 })
  if (!laudo.token) return NextResponse.json({ error: 'Laudo sem token válido.' }, { status: 422 })

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_URL ?? 'https://biopetvet.com'
  const link    = `${baseUrl}/laudo/${laudo.token}`
  const text    = `Olá! O laudo do *${laudo.nome_pet}* já está disponível. Acesse pelo link abaixo:\n\n${link}`

  const ok = await sendWhatsAppText(laudo.telefone, text)
  if (!ok) return NextResponse.json({ error: 'Falha ao enviar mensagem' }, { status: 502 })

  return NextResponse.json({ ok: true })
}

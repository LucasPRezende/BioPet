import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const id = Number(params.id)
  if (!id) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })

  const { data: laudo, error } = await supabase
    .from('laudos')
    .select('nome_pet, telefone, token')
    .eq('id', id)
    .single()

  if (error || !laudo) return NextResponse.json({ error: 'Laudo não encontrado' }, { status: 404 })

  const apiUrl   = process.env.EVOLUTION_API_URL
  const apiKey   = process.env.EVOLUTION_API_KEY
  const instance = process.env.EVOLUTION_INSTANCE

  if (!apiUrl || !apiKey || !instance) {
    return NextResponse.json({ error: 'Evolution API não configurada' }, { status: 503 })
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const link    = `${baseUrl}/laudo/${laudo.token}`
  const text    = `Olá! O laudo do *${laudo.nome_pet}* já está disponível. Acesse pelo link abaixo:\n\n${link}`

  const digits = laudo.telefone.replace(/\D/g, '')
  const number = digits.startsWith('55') ? digits : `55${digits}`

  const res = await fetch(`${apiUrl}/message/sendText/${instance}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: apiKey },
    body: JSON.stringify({ number, text }),
  })

  if (!res.ok) {
    const body = await res.text()
    console.error(`[Evolution API] Erro ${res.status}:`, body)
    return NextResponse.json({ error: 'Falha ao enviar mensagem' }, { status: 502 })
  }

  return NextResponse.json({ ok: true })
}

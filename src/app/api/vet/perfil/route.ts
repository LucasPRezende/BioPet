import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabase } from '@/lib/supabase'
import { parseVetSession } from '@/lib/vet-auth'

async function getVetId(): Promise<number | null> {
  const session = (await cookies()).get('vet_session')?.value
  if (!session) return null
  return parseVetSession(session)
}

export async function GET() {
  const vetId = await getVetId()
  if (!vetId) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })

  const { data, error } = await supabase
    .from('veterinarios')
    .select('id, nome, email, whatsapp, convite_aceito, criado_em')
    .eq('id', vetId)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PATCH(request: NextRequest) {
  const vetId = await getVetId()
  if (!vetId) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })

  const body = await request.json()
  const updates: Record<string, string> = { atualizado_em: new Date().toISOString() }

  if (body.nome?.trim())     updates.nome     = body.nome.trim()
  if (body.whatsapp?.trim()) updates.whatsapp = body.whatsapp.trim()
  if (body.email?.trim())    updates.email    = body.email.trim().toLowerCase()

  const { data, error } = await supabase
    .from('veterinarios')
    .update(updates)
    .eq('id', vetId)
    .select('id, nome, email, whatsapp')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

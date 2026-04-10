import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { verifyAgentKey } from '@/lib/agent-auth'

export async function POST(request: NextRequest) {
  if (!verifyAgentKey(request)) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const telefone: string | undefined = body?.telefone
  const nome: string | undefined = body?.nome

  if (!telefone) {
    return NextResponse.json({ error: 'Campo "telefone" é obrigatório.' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('tutores')
    .insert({ telefone, nome: nome ?? null })
    .select('id, nome, telefone')
    .single()

  if (error) {
    // Conflito de telefone — retorna o existente
    if (error.code === '23505') {
      const { data: existing } = await supabase
        .from('tutores')
        .select('id, nome, telefone')
        .eq('telefone', telefone)
        .single()
      return NextResponse.json(existing, { status: 200 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data, { status: 201 })
}

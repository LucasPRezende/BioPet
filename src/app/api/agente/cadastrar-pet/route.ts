import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { verifyAgentKey } from '@/lib/agent-auth'

export async function POST(request: NextRequest) {
  if (!verifyAgentKey(request)) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const { tutor_id, nome, especie, raca } = body ?? {}

  if (!tutor_id || !nome) {
    return NextResponse.json({ error: 'Campos "tutor_id" e "nome" são obrigatórios.' }, { status: 400 })
  }

  // Verifica se já existe pet com o mesmo nome para este tutor
  const { data: existing } = await supabase
    .from('pets')
    .select('id, nome, especie, raca')
    .eq('tutor_id', Number(tutor_id))
    .ilike('nome', nome)
    .maybeSingle()

  if (existing) return NextResponse.json(existing, { status: 200 })

  const { data, error } = await supabase
    .from('pets')
    .insert({ tutor_id: Number(tutor_id), nome, especie: especie ?? null, raca: raca ?? null })
    .select('id, nome, especie, raca')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data, { status: 201 })
}

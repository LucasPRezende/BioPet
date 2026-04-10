import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { verifyAgentKey } from '@/lib/agent-auth'

export async function GET(request: NextRequest) {
  if (!verifyAgentKey(request)) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
  }

  const telefone = request.nextUrl.searchParams.get('telefone')?.trim()
  if (!telefone) {
    return NextResponse.json({ error: 'Parâmetro "telefone" obrigatório.' }, { status: 400 })
  }

  // Normaliza: remove não-dígitos, garante prefixo 55
  const digits = telefone.replace(/\D/g, '')
  const telNorm = digits.startsWith('55') ? digits : `55${digits}`

  // Busca tutor pelo telefone (aceita com ou sem 55)
  const { data: tutor } = await supabase
    .from('tutores')
    .select('id')
    .or(`telefone.eq.${telNorm},telefone.eq.${digits}`)
    .maybeSingle()

  if (!tutor) {
    return NextResponse.json({ tem_laudo: false, laudos: [] })
  }

  const { data: laudos, error } = await supabase
    .from('laudos')
    .select('token, tipo_exame, created_at, pets(nome)')
    .eq('tutor_id', tutor.id)
    .order('created_at', { ascending: false })
    .limit(3)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''

  const resultado = (laudos ?? []).map((l: Record<string, unknown>) => {
    const pets = l.pets as { nome: string }[] | null
    const pet  = Array.isArray(pets) ? pets[0]?.nome ?? null : (pets as { nome: string } | null)?.nome ?? null
    return {
      pet,
      tipo_exame: l.tipo_exame as string | null,
      data:       new Date(l.created_at as string).toLocaleDateString('pt-BR'),
      link:       `${baseUrl}/laudo/${l.token as string}`,
    }
  })

  return NextResponse.json({ tem_laudo: resultado.length > 0, laudos: resultado })
}

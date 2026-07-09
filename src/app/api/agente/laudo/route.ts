import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { verifyAgentKey } from '@/lib/agent-auth'
import { normalizeTelefone } from '@/lib/telefone'

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
  const telNorm = normalizeTelefone(digits)

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
    .select('id, tipo_exame, criado_em, filename, pets(nome)')
    .eq('tutor_id', tutor.id)
    .order('criado_em', { ascending: false })
    .limit(5)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // NÃO retorna link: os links de laudo exigem login (fechados por segurança).
  // O agente deve ENVIAR o PDF (ver /api/agente/laudo/enviar). Aqui só listamos
  // para o cliente escolher qual laudo quer receber.
  const resultado = (laudos ?? []).map((l: Record<string, unknown>) => {
    const pets = l.pets as { nome: string }[] | null
    const pet  = Array.isArray(pets) ? pets[0]?.nome ?? null : (pets as { nome: string } | null)?.nome ?? null
    return {
      id:         l.id as number,
      pet,
      tipo_exame: l.tipo_exame as string | null,
      data:       new Date(l.criado_em as string).toLocaleDateString('pt-BR'),
      tem_arquivo: !!l.filename,
    }
  })

  return NextResponse.json({ tem_laudo: resultado.length > 0, laudos: resultado })
}

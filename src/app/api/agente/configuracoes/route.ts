import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { parseSystemSession, SESSION_COOKIE_NAME } from '@/lib/system-auth'

export const dynamic = 'force-dynamic'

// GET — público (sem autenticação), usado pelo agente N8N
export async function GET() {
  const { data, error } = await supabase
    .from('configuracoes_agente')
    .select('tempo_retorno_ia_horas, numeros_bloqueados')
    .order('id')
    .limit(1)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // numeros_bloqueados é JSONB [{numero, descricao}] — retorna só os números para o agente
  const bloqueados = (data.numeros_bloqueados as { numero: string; descricao?: string }[] ?? [])
    .map(n => n.numero)

  return NextResponse.json({
    tempo_retorno_ia_horas: data.tempo_retorno_ia_horas,
    numeros_bloqueados:     bloqueados,
  })
}

// PUT — só admin
export async function PUT(request: NextRequest) {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (!cookie) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  const session = await parseSystemSession(cookie)
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 })

  const { tempo_retorno_ia_horas, numeros_bloqueados } = body

  // Busca o id do registro único
  const { data: existing } = await supabase
    .from('configuracoes_agente')
    .select('id')
    .order('id')
    .limit(1)
    .single()

  const id = existing?.id ?? 1

  const { data, error } = await supabase
    .from('configuracoes_agente')
    .upsert(
      {
        id,
        tempo_retorno_ia_horas: tempo_retorno_ia_horas ?? 2,
        numeros_bloqueados:     numeros_bloqueados ?? [],
        atualizado_em:          new Date().toISOString(),
      },
      { onConflict: 'id' },
    )
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

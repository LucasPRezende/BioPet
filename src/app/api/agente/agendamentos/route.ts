import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { verifyAgentKey } from '@/lib/agent-auth'

export async function GET(request: NextRequest) {
  if (!verifyAgentKey(request)) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
  }

  const data = request.nextUrl.searchParams.get('data')
  if (!data) {
    return NextResponse.json({ error: 'Parâmetro "data" é obrigatório (formato: YYYY-MM-DD).' }, { status: 400 })
  }

  const start = `${data}T00:00:00`
  const end   = `${data}T23:59:59`

  const { data: rows, error } = await supabase
    .from('agendamentos')
    .select('*, tutores(id, nome, telefone), pets(id, nome, especie, raca)')
    .gte('data_hora', start)
    .lte('data_hora', end)
    .order('data_hora')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(rows ?? [])
}

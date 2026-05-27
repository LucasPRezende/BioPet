import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { parseSystemSession, SESSION_COOKIE_NAME } from '@/lib/system-auth'
import { gerarFeriadosPorAno } from '@/lib/feriados'

export async function POST(request: NextRequest) {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (!cookie) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  const session = await parseSystemSession(cookie)
  if (!session || session.role !== 'admin') return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })

  const body = await request.json().catch(() => null)
  const { ano_inicio, ano_fim } = body ?? {}

  if (!ano_inicio || !ano_fim || ano_inicio > ano_fim || ano_fim - ano_inicio > 30) {
    return NextResponse.json({ error: 'Intervalo de anos inválido (máx 30 anos).' }, { status: 400 })
  }

  const todos: { data: string; nome: string; tipo: string }[] = []
  for (let ano = ano_inicio; ano <= ano_fim; ano++) {
    todos.push(...gerarFeriadosPorAno(ano))
  }

  const { error } = await supabase
    .from('feriados')
    .upsert(todos, { onConflict: 'data,nome', ignoreDuplicates: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, gerados: todos.length })
}

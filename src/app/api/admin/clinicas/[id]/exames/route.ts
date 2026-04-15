import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { parseSystemSession, SESSION_COOKIE_NAME } from '@/lib/system-auth'

async function requireAdmin(request: NextRequest) {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (!cookie) return null
  const session = await parseSystemSession(cookie)
  return session?.role === 'admin' ? session : null
}

// GET — retorna todos os exames com quais estão permitidos para a clínica
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!await requireAdmin(request)) {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })
  }

  const { id } = await params
  const clinicaId = parseInt(id)

  const [{ data: todos }, { data: perms }] = await Promise.all([
    supabase.from('comissoes_exame').select('tipo_exame').order('tipo_exame'),
    supabase.from('clinica_exames_permitidos').select('tipo_exame').eq('clinica_id', clinicaId),
  ])

  const permitidos = new Set((perms ?? []).map(p => p.tipo_exame))

  return NextResponse.json({
    exames: (todos ?? []).map(t => ({
      tipo_exame: t.tipo_exame,
      permitido:  permitidos.has(t.tipo_exame),
    })),
  })
}

// PUT — substitui a lista de exames permitidos para a clínica
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!await requireAdmin(request)) {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })
  }

  const { id } = await params
  const clinicaId = parseInt(id)
  const body = await request.json().catch(() => null)
  const { exames } = body ?? {}

  if (!Array.isArray(exames)) {
    return NextResponse.json({ error: '"exames" deve ser um array de strings.' }, { status: 400 })
  }

  // Remove todos e reinserire os selecionados
  await supabase.from('clinica_exames_permitidos').delete().eq('clinica_id', clinicaId)

  if (exames.length > 0) {
    const rows = exames.map((tipo: string) => ({ clinica_id: clinicaId, tipo_exame: tipo }))
    const { error } = await supabase.from('clinica_exames_permitidos').insert(rows)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ sucesso: true })
}

import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { parseSystemSession, SESSION_COOKIE_NAME } from '@/lib/system-auth'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (!cookie) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  const session = await parseSystemSession(cookie)
  if (!session || session.role !== 'admin') return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })

  const clinicaId = Number(params.id)
  if (!clinicaId) return NextResponse.json({ error: 'clinica_id inválido.' }, { status: 400 })

  const body = await request.json().catch(() => null)
  const ids: number[] = body?.agendamento_ids ?? []
  if (!ids.length) return NextResponse.json({ error: 'Nenhum agendamento selecionado.' }, { status: 400 })

  const now = new Date().toISOString()

  const { error } = await supabase
    .from('agendamentos')
    .update({ repasse_confirmado: true, repasse_em: now, status_pagamento: 'pago_clinica' })
    .in('id', ids)
    .eq('clinica_id', clinicaId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}

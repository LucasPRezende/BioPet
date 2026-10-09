import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { parseSystemSession, SESSION_COOKIE_NAME } from '@/lib/system-auth'

// POST — estorna um pagamento (não apaga: fica no histórico, fora do saldo)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value
  const session = cookie ? await parseSystemSession(cookie) : null
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })
  }

  const id = parseInt((await params).id)
  if (!id) return NextResponse.json({ error: 'ID inválido.' }, { status: 400 })

  const body = await request.json().catch(() => null)
  const motivo = typeof body?.motivo === 'string' ? body.motivo.trim().slice(0, 500) : ''
  if (!motivo) return NextResponse.json({ error: 'Informe o motivo do estorno.' }, { status: 400 })

  // Só estorna o que ainda não foi estornado (o filtro no UPDATE evita corrida)
  const { data, error } = await supabase
    .from('pagamentos_comissao')
    .update({ estornado_em: new Date().toISOString(), estornado_por: session.userId, estornado_motivo: motivo })
    .eq('id', id)
    .is('estornado_em', null)
    .select('id')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data?.length) {
    return NextResponse.json({ error: 'Pagamento não encontrado ou já estornado.' }, { status: 404 })
  }
  return NextResponse.json({ ok: true })
}

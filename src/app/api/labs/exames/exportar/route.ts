import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { parseSystemSession, SESSION_COOKIE_NAME } from '@/lib/system-auth'
import { gerarExcel } from '@/lib/lab-excel'

export const dynamic = 'force-dynamic'

// Baixa o catálogo completo em Excel (uma aba por laboratório) para a equipe
// editar e reimportar em /api/labs/exames/importar.
export async function GET(request: NextRequest) {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value
  const session = cookie ? await parseSystemSession(cookie) : null
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })
  }

  const [labs, exames] = await Promise.all([
    supabase.from('lab_laboratorios').select('id, nome').order('nome'),
    supabase.from('lab_exames').select('*'),
  ])
  if (labs.error) return NextResponse.json({ error: labs.error.message }, { status: 500 })
  if (exames.error) return NextResponse.json({ error: exames.error.message }, { status: 500 })

  const buffer = gerarExcel(labs.data, exames.data)
  const hoje = new Date().toISOString().slice(0, 10)
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="catalogo-labs-parceiros-${hoje}.xlsx"`,
    },
  })
}

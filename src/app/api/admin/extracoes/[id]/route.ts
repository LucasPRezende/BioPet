import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { comissaoExtracaoDe, tiposComExtracao } from '@/lib/comissao-exame'
import { carregarComissoes } from '@/lib/comissao-exame-db'
import { parseSystemSession, SESSION_COOKIE_NAME } from '@/lib/system-auth'

/**
 * Comissão de extração do agendamento = soma da comissao_extracao dos seus
 * exames (tabela de Preços). null → o agendamento não tem exame com extração.
 * Legado sem agendamento_exames: só existia para hemogasometria.
 */
async function comissaoDoAgendamento(agId: number): Promise<number | null> {
  const [tabela, { data: ae }, { data: ag }] = await Promise.all([
    carregarComissoes(),
    supabase.from('agendamento_exames').select('tipo_exame').eq('agendamento_id', agId),
    supabase.from('agendamentos').select('tipo_exame').eq('id', agId).maybeSingle(),
  ])
  const linhas = (ae ?? []).map(r => r.tipo_exame as string)
  const tipos  = new Set(tiposComExtracao(tabela))
  if (linhas.some(t => tipos.has(t))) return comissaoExtracaoDe(linhas, tabela)
  if (linhas.length === 0 && /hemogasometria/i.test(ag?.tipo_exame ?? '')) {
    return comissaoExtracaoDe(['Hemogasometria'], tabela)
  }
  return null
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (!cookie) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  const session = await parseSystemSession(cookie)
  if (!session || session.role !== 'admin') return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })

  const { id } = await params
  const agId   = parseInt(id)
  if (!agId) return NextResponse.json({ error: 'ID inválido.' }, { status: 400 })

  let body: Record<string, unknown>
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 }) }

  // Garante que o agendamento tem exame com comissão de extração
  const valorComissao = await comissaoDoAgendamento(agId)
  if (valorComissao === null) {
    return NextResponse.json({ error: 'Agendamento não tem exame com extração.' }, { status: 403 })
  }

  // Atribuir vet de extração
  if ('vet_extracao_id' in body) {
    const vetId = Number(body.vet_extracao_id)
    if (!vetId) return NextResponse.json({ error: 'vet_extracao_id inválido.' }, { status: 400 })

    // Valida que o vet existe
    const { data: vet } = await supabase.from('veterinarios').select('id').eq('id', vetId).single()
    if (!vet) return NextResponse.json({ error: 'Veterinário não encontrado.' }, { status: 404 })

    const { error } = await supabase
      .from('agendamentos')
      .update({ vet_extracao_id: vetId, comissao_extracao: valorComissao })
      .eq('id', agId)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ sucesso: true, comissao_extracao: valorComissao })
  }

  // Pagamento de comissão não é mais feito aqui: ver /admin/pagamentos-comissao.

  return NextResponse.json({ error: 'Nenhuma operação reconhecida.' }, { status: 400 })
}

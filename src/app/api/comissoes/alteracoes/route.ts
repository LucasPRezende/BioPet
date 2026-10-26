import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { parseSystemSession, SESSION_COOKIE_NAME } from '@/lib/system-auth'
import { podeAtivar } from '@/lib/precos-regras'
import type { TabelaPreco } from '@/lib/historico-precos'

// POST — aplica um lote de alterações da tela de Preços ("Revisar e salvar").
// Tudo ou nada: a função aplicar_alteracoes_precos (migration v49) roda numa
// transação, confere que o "antes" ainda é o valor do banco e grava o histórico.

interface Alteracao {
  tabela: TabelaPreco
  id:     number
  campo:  string
  antes:  number | boolean | null
  depois: number | boolean | null
}

const TABELAS: TabelaPreco[] = ['comissoes_exame', 'bioquimica_exames', 'testes_rapidos', 'exames_pcr']

export async function POST(request: NextRequest) {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value
  const session = cookie ? await parseSystemSession(cookie) : null
  if (!session || session.role !== 'admin') return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })

  const body = await request.json().catch(() => null)
  const alteracoes = body?.alteracoes as Alteracao[] | undefined
  if (!Array.isArray(alteracoes) || alteracoes.length === 0) {
    return NextResponse.json({ error: 'Nenhuma alteração enviada.' }, { status: 400 })
  }
  for (const a of alteracoes) {
    const okValor = (v: unknown) => v === null || typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v) && v >= 0)
    if (!TABELAS.includes(a?.tabela) || !Number.isInteger(a?.id) || typeof a?.campo !== 'string' ||
        !okValor(a.antes) || !okValor(a.depois)) {
      return NextResponse.json({ error: 'Alteração inválida.' }, { status: 400 })
    }
  }

  // Exame ativo precisa de Pix comercial. Confere o estado FINAL de cada exame
  // tocado pelo lote (banco + alterações).
  const idsExame = Array.from(new Set(alteracoes.filter(a => a.tabela === 'comissoes_exame').map(a => a.id)))
  if (idsExame.length > 0) {
    const { data: exames, error } = await supabase
      .from('comissoes_exame')
      .select('id, tipo_exame, ativo, preco_pix_comercial')
      .in('id', idsExame)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    for (const ex of exames ?? []) {
      const final = { ...ex } as Record<string, unknown>
      for (const a of alteracoes) if (a.tabela === 'comissoes_exame' && a.id === ex.id) final[a.campo] = a.depois
      const linha = final as { tipo_exame: string; ativo: boolean; preco_pix_comercial: number | null }
      if (linha.ativo && !podeAtivar(linha)) {
        return NextResponse.json({
          error: `${linha.tipo_exame}: exame ativo precisa do Pix comercial. Defina o valor ou desative.`,
        }, { status: 400 })
      }
    }
  }

  const { data: lote, error } = await supabase.rpc('aplicar_alteracoes_precos', {
    p_alteracoes: alteracoes.map(a => ({ tabela: a.tabela, id: a.id, campo: a.campo, antes: a.antes, depois: a.depois })),
    p_usuario:    session.userId,
  })

  if (error) {
    if (error.message.startsWith('conflito')) {
      return NextResponse.json({
        error: 'Alguém alterou a tabela antes de você. Recarregue a página para ver os valores atuais.',
      }, { status: 409 })
    }
    if (error.message.startsWith('nao_encontrado')) {
      return NextResponse.json({ error: 'Um dos itens não existe mais. Recarregue a página.' }, { status: 409 })
    }
    if (error.message.startsWith('campo_invalido')) {
      return NextResponse.json({ error: 'Campo não editável.' }, { status: 400 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ lote_id: lote, total: alteracoes.length })
}

import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { parseSystemSession, SESSION_COOKIE_NAME } from '@/lib/system-auth'
import { DATA_CORTE, carregarPosicao, pessoaDoVet, type PessoaTipo } from '@/lib/comissao-saldo'

// GET ?tipo=usuario|veterinario&id=N — extrato: o que gerou o devido
// (laudos e extrações desde a data de corte) e os pagamentos, por data.
export async function GET(request: NextRequest) {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value
  const session = cookie ? await parseSystemSession(cookie) : null
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })
  }

  const tipo = request.nextUrl.searchParams.get('tipo') as PessoaTipo | null
  const id   = Number(request.nextUrl.searchParams.get('id'))
  if ((tipo !== 'usuario' && tipo !== 'veterinario') || !Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'Pessoa inválida.' }, { status: 400 })
  }

  try {
    const posicao = await carregarPosicao({ tipo, id })

    type Item = { data: string; tipo: 'laudo' | 'extracao' | 'pagamento' | 'estorno'; descricao: string; valor: number; ref_id: number }
    const itens: Item[] = []

    // Laudos (só pessoa 'usuario')
    if (tipo === 'usuario') {
      const { data } = await supabase
        .from('laudos')
        .select('id, tipo_exame, nome_pet, criado_em, valor_comissao')
        .eq('system_user_id', id)
        .gte('criado_em', `${DATA_CORTE}T00:00:00`)
        .gt('valor_comissao', 0)
        .order('criado_em', { ascending: false })
        .limit(1000)
      for (const l of data ?? []) {
        itens.push({
          data: l.criado_em, tipo: 'laudo', ref_id: l.id, valor: Number(l.valor_comissao),
          descricao: [l.tipo_exame, l.nome_pet].filter(Boolean).join(' — '),
        })
      }
    }

    // Extrações: vets desta pessoa (o próprio vet, ou os vinculados ao usuário)
    const { data: vets } = tipo === 'usuario'
      ? await supabase.from('veterinarios').select('id, system_user_id').eq('system_user_id', id)
      : await supabase.from('veterinarios').select('id, system_user_id').eq('id', id)
    const vetIds = (vets ?? []).filter(v => {
      const p = pessoaDoVet(v)
      return p.tipo === tipo && p.id === id
    }).map(v => v.id)

    if (vetIds.length) {
      const { data } = await supabase
        .from('agendamentos')
        .select('id, tipo_exame, data_hora, comissao_extracao, pets(nome)')
        .in('vet_extracao_id', vetIds)
        .gte('data_hora', `${DATA_CORTE}T00:00:00`)
        .gt('comissao_extracao', 0)
        .order('data_hora', { ascending: false })
        .limit(1000)
      for (const a of data ?? []) {
        const petRaw = a.pets as unknown
        const pet = (Array.isArray(petRaw) ? petRaw[0] : petRaw) as { nome: string } | null
        itens.push({
          data: a.data_hora, tipo: 'extracao', ref_id: a.id, valor: Number(a.comissao_extracao),
          descricao: ['Extração', a.tipo_exame, pet?.nome].filter(Boolean).join(' — '),
        })
      }
    }

    const { data: pags } = await supabase
      .from('pagamentos_comissao')
      .select('id, valor, pago_em, forma, observacao, estornado_em, estornado_motivo')
      .eq('pessoa_tipo', tipo)
      .eq('pessoa_id', id)
      .order('pago_em', { ascending: false })
    for (const p of pags ?? []) {
      const desc = [p.forma, p.observacao].filter(Boolean).join(' — ') || 'Pagamento'
      itens.push({ data: p.pago_em, tipo: 'pagamento', ref_id: p.id, valor: Number(p.valor), descricao: desc })
      if (p.estornado_em) {
        itens.push({ data: p.estornado_em, tipo: 'estorno', ref_id: p.id, valor: Number(p.valor), descricao: `Estorno: ${p.estornado_motivo ?? ''}` })
      }
    }

    itens.sort((a, b) => (a.data < b.data ? 1 : -1))
    return NextResponse.json({ data_corte: DATA_CORTE, posicao, itens })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erro ao carregar.' }, { status: 500 })
  }
}

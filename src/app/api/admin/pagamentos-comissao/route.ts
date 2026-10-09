import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { parseSystemSession, SESSION_COOKIE_NAME } from '@/lib/system-auth'
import {
  DATA_CORTE, carregarPosicoes, carregarPosicao, excedente,
  validarValor, validarDataPagamento, type PessoaTipo,
} from '@/lib/comissao-saldo'

async function requireAdmin(request: NextRequest) {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (!cookie) return null
  const session = await parseSystemSession(cookie)
  if (!session || session.role !== 'admin') return null
  return session
}

const hojeBR = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })

// GET — saldo por pessoa + histórico de pagamentos (inclui estornados)
//   ?tipo=usuario|veterinario&id=N  filtra o histórico de uma pessoa
//   ?inicio=YYYY-MM-DD&fim=YYYY-MM-DD filtra o histórico por data do pagamento
export async function GET(request: NextRequest) {
  if (!(await requireAdmin(request))) {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })
  }

  const sp     = request.nextUrl.searchParams
  const tipo   = sp.get('tipo')
  const id     = Number(sp.get('id'))
  const inicio = sp.get('inicio')
  const fim    = sp.get('fim')

  try {
    const pessoas = await carregarPosicoes()

    let q = supabase
      .from('pagamentos_comissao')
      .select('id, pessoa_tipo, pessoa_id, valor, pago_em, forma, observacao, criado_por, criado_em, estornado_em, estornado_motivo')
      .order('pago_em', { ascending: false })
      .order('id', { ascending: false })
      .limit(500)
    if ((tipo === 'usuario' || tipo === 'veterinario') && id) q = q.eq('pessoa_tipo', tipo).eq('pessoa_id', id)
    if (inicio) q = q.gte('pago_em', inicio)
    if (fim)    q = q.lte('pago_em', fim)

    const { data: pags, error } = await q
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const nomes = new Map(pessoas.map(p => [p.chave, p.nome]))
    const autorIds = Array.from(new Set((pags ?? []).map(p => p.criado_por).filter(Boolean))) as number[]
    const { data: autores } = autorIds.length
      ? await supabase.from('system_users').select('id, nome').in('id', autorIds)
      : { data: [] }
    const autorNome = new Map((autores ?? []).map(a => [a.id, a.nome as string]))

    const pagamentos = (pags ?? []).map(p => ({
      ...p,
      valor: Number(p.valor),
      pessoa_nome: nomes.get(`${p.pessoa_tipo}:${p.pessoa_id}`) ?? '—',
      criado_por_nome: p.criado_por ? autorNome.get(p.criado_por) ?? null : null,
    }))

    return NextResponse.json({ data_corte: DATA_CORTE, pessoas, pagamentos })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erro ao carregar.' }, { status: 500 })
  }
}

// POST — registra um pagamento de valor livre.
// Se o valor passa do saldo devido, vira adiantamento: o servidor exige
// confirmar_adiantamento=true (a tela mostra o aviso e reenvia).
export async function POST(request: NextRequest) {
  const session = await requireAdmin(request)
  if (!session) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 })

  const tipo = body.pessoa_tipo as PessoaTipo
  const pessoaId = Number(body.pessoa_id)
  if ((tipo !== 'usuario' && tipo !== 'veterinario') || !Number.isInteger(pessoaId) || pessoaId <= 0) {
    return NextResponse.json({ error: 'Pessoa inválida.' }, { status: 400 })
  }

  const v = validarValor(body.valor)
  if (!v.ok) return NextResponse.json({ error: v.erro }, { status: 400 })

  const hoje = hojeBR()
  const d = body.pago_em ? validarDataPagamento(body.pago_em, hoje) : { ok: true as const, data: hoje }
  if (!d.ok) return NextResponse.json({ error: d.erro }, { status: 400 })

  const forma = typeof body.forma === 'string' ? body.forma.trim().slice(0, 40) || null : null
  const observacao = typeof body.observacao === 'string' ? body.observacao.trim().slice(0, 500) || null : null

  // A pessoa precisa existir. Vet vinculado a um usuário tem o saldo no usuário.
  if (tipo === 'usuario') {
    const { data } = await supabase.from('system_users').select('id').eq('id', pessoaId).maybeSingle()
    if (!data) return NextResponse.json({ error: 'Usuário não encontrado.' }, { status: 404 })
  } else {
    const { data } = await supabase.from('veterinarios').select('id, system_user_id').eq('id', pessoaId).maybeSingle()
    if (!data) return NextResponse.json({ error: 'Veterinário não encontrado.' }, { status: 404 })
    if (data.system_user_id) {
      return NextResponse.json({ error: 'Este veterinário tem usuário vinculado: o saldo é do usuário.' }, { status: 400 })
    }
  }

  try {
    const posicao = await carregarPosicao({ tipo, id: pessoaId })
    const saldoAtual = posicao?.saldo ?? 0
    const passa = excedente(saldoAtual, v.valor)

    if (passa > 0 && body.confirmar_adiantamento !== true) {
      return NextResponse.json({
        error: `Este pagamento passa R$ ${passa.toFixed(2).replace('.', ',')} do que é devido e vira adiantamento.`,
        requer_confirmacao: 'adiantamento',
        saldo_atual: saldoAtual,
        excedente: passa,
      }, { status: 409 })
    }

    const { data, error } = await supabase
      .from('pagamentos_comissao')
      .insert({
        pessoa_tipo: tipo,
        pessoa_id: pessoaId,
        valor: v.valor,
        pago_em: d.data,
        forma,
        observacao,
        criado_por: session.userId,
      })
      .select('id')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, id: data.id, adiantamento: passa > 0, excedente: passa }, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erro ao registrar.' }, { status: 500 })
  }
}

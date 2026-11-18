import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { parseSystemSession, SESSION_COOKIE_NAME } from '@/lib/system-auth'
import { fromComissao } from '@/lib/pricing'
import {
  calcularOrcamento, normalizarValidadeDias, hojeBrasilia, validadeAte,
  type ItemOrcamento,
} from '@/lib/orcamento'
import { generateOrcamentoPDF } from '@/lib/generate-orcamento-pdf'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

const MAX_ITENS = 40

function sanitizeFilename(s: string): string {
  return s.replace(/[<>:"/\\|?*\x00-\x1f]/g, '').replace(/\s+/g, ' ').trim()
}

const listaTexto = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '').map(x => x.trim()) : []

type LinhaFixa = { nome: string; preco_pix: number | string | null; preco_cartao: number | string | null }

/** Preço fixo (não varia por horário) de bioquímica / teste rápido / PCR. */
const precoFixo = (row: LinhaFixa) => ({
  varia_por_horario: false,
  valor_pix: Number(row.preco_pix ?? 0), valor_cartao: Number(row.preco_cartao ?? 0),
  valor_especial_pix: null, valor_especial_cartao: null,
})

/** GET /api/orcamento — catálogo para a tela (só nomes e preço PIX de referência). */
export async function GET(request: NextRequest) {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (!cookie || !(await parseSystemSession(cookie))) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  }
  const [ex, bio, tr, pcr] = await Promise.all([
    supabase.from('comissoes_exame')
      .select('tipo_exame, varia_por_horario, preco_pix_comercial').order('tipo_exame'),
    supabase.from('bioquimica_exames').select('nome, preco_pix').eq('ativo', true).order('ordem'),
    supabase.from('testes_rapidos').select('nome, preco_pix').eq('ativo', true).order('ordem'),
    supabase.from('exames_pcr').select('nome, preco_pix').eq('ativo', true).order('ordem'),
  ])
  if (ex.error || bio.error || tr.error || pcr.error) {
    return NextResponse.json({ error: 'Erro ao carregar o catálogo.' }, { status: 500 })
  }
  return NextResponse.json({
    exames: (ex.data ?? []).filter(e => Number(e.preco_pix_comercial) > 0)
      .map(e => ({ nome: e.tipo_exame, pix: Number(e.preco_pix_comercial) })),
    bioquimica: (bio.data ?? []).filter(e => Number(e.preco_pix) > 0).map(e => ({ nome: e.nome, pix: Number(e.preco_pix ?? 0) })),
    testes_rapidos: (tr.data ?? []).filter(e => Number(e.preco_pix) > 0).map(e => ({ nome: e.nome, pix: Number(e.preco_pix ?? 0) })),
    pcr: (pcr.data ?? []).filter(e => Number(e.preco_pix) > 0).map(e => ({ nome: e.nome, pix: Number(e.preco_pix ?? 0) })),
  })
}

/**
 * POST /api/orcamento — gera o PDF do orçamento (particular). Não grava nada.
 * Body: { paciente, exames, bioquimica, testes_rapidos, pcr: string[] (nomes), validade_dias? }
 * O preço vem da tabela; o cliente só diz QUAIS exames.
 */
export async function POST(request: NextRequest) {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (!cookie) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  const session = await parseSystemSession(cookie)
  if (!session) return NextResponse.json({ error: 'Sessão inválida.' }, { status: 401 })

  let body: Record<string, unknown>
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 })
  }

  const paciente = typeof body.paciente === 'string' ? body.paciente.trim().slice(0, 120) : ''
  if (!paciente) return NextResponse.json({ error: 'Informe o nome do paciente.' }, { status: 400 })

  const exames = Array.from(new Set(listaTexto(body.exames)))
  const bio = Array.from(new Set(listaTexto(body.bioquimica)))
  const trs = Array.from(new Set(listaTexto(body.testes_rapidos)))
  const pcrs = Array.from(new Set(listaTexto(body.pcr)))
  const qtd = exames.length + bio.length + trs.length + pcrs.length
  if (qtd === 0) {
    return NextResponse.json({ error: 'Selecione ao menos um exame.' }, { status: 400 })
  }
  if (qtd > MAX_ITENS) {
    return NextResponse.json({ error: 'Exames demais no mesmo orçamento.' }, { status: 400 })
  }

  const catalogo = (tabela: string, nomes: string[]) =>
    nomes.length
      ? supabase.from(tabela).select('nome, preco_pix, preco_cartao').eq('ativo', true).in('nome', nomes)
      : Promise.resolve({ data: [] as LinhaFixa[], error: null })

  const [{ data: tabela, error: e1 }, { data: bioTab, error: e2 }, { data: trTab, error: e3 }, { data: pcrTab, error: e4 }] = await Promise.all([
    exames.length
      ? supabase.from('comissoes_exame')
          .select('tipo_exame, varia_por_horario, preco_pix_comercial, preco_cartao_comercial, preco_pix_fora_horario, preco_cartao_fora_horario')
          .in('tipo_exame', exames)
      : Promise.resolve({ data: [], error: null }),
    catalogo('bioquimica_exames', bio),
    catalogo('testes_rapidos', trs),
    catalogo('exames_pcr', pcrs),
  ])
  if (e1 || e2 || e3 || e4) return NextResponse.json({ error: 'Erro ao consultar preços.' }, { status: 500 })

  const itens: ItemOrcamento[] = []
  for (const nome of exames) {
    const row = (tabela ?? []).find(t => t.tipo_exame === nome)
    if (!row) return NextResponse.json({ error: `Exame não encontrado: ${nome}` }, { status: 400 })
    itens.push({ nome, preco: fromComissao(row) })
  }
  const fixos: [string, string[], LinhaFixa[] | null, string][] = [
    ['Bioquímica', bio, bioTab as LinhaFixa[] | null, 'Exame de bioquímica'],
    ['Teste Rápido', trs, trTab as LinhaFixa[] | null, 'Teste rápido'],
    ['PCR', pcrs, pcrTab as LinhaFixa[] | null, 'PCR'],
  ]
  for (const [rotulo, nomes, linhas, msg] of fixos) {
    for (const nome of nomes) {
      const row = (linhas ?? []).find(b => b.nome === nome)
      if (!row) return NextResponse.json({ error: `${msg} não encontrado: ${nome}` }, { status: 400 })
      // Preço 0 = valor ainda não cadastrado: não vira "R$ 0" no orçamento.
      if (!(Number(row.preco_pix) > 0)) {
        return NextResponse.json({ error: `${msg} sem valor cadastrado: ${nome}` }, { status: 400 })
      }
      itens.push({ nome: `${rotulo} — ${nome}`, preco: precoFixo(row) })
    }
  }

  const validade_dias = normalizarValidadeDias(body.validade_dias)
  const emissao = hojeBrasilia()

  try {
    const pdf = await generateOrcamentoPDF({
      paciente, emissao, validade_dias,
      validade: validadeAte(emissao, validade_dias),
      orcamento: calcularOrcamento(itens),
    })
    const filename = sanitizeFilename(`Orçamento - ${paciente}.pdf`)
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (e) {
    console.error('[orcamento] Erro ao gerar PDF:', e)
    return NextResponse.json({ error: 'Erro ao gerar o orçamento.' }, { status: 500 })
  }
}

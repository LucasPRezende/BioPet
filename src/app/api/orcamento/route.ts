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

/**
 * POST /api/orcamento — gera o PDF do orçamento (particular). Não grava nada.
 * Body: { paciente, exames: string[] (tipo_exame), bioquimica: string[] (nome), validade_dias? }
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
  if (exames.length + bio.length === 0) {
    return NextResponse.json({ error: 'Selecione ao menos um exame.' }, { status: 400 })
  }
  if (exames.length + bio.length > MAX_ITENS) {
    return NextResponse.json({ error: 'Exames demais no mesmo orçamento.' }, { status: 400 })
  }

  const [{ data: tabela, error: e1 }, { data: bioTab, error: e2 }] = await Promise.all([
    exames.length
      ? supabase.from('comissoes_exame')
          .select('tipo_exame, varia_por_horario, preco_pix_comercial, preco_cartao_comercial, preco_pix_fora_horario, preco_cartao_fora_horario')
          .in('tipo_exame', exames)
      : Promise.resolve({ data: [], error: null }),
    bio.length
      ? supabase.from('bioquimica_exames')
          .select('nome, preco_pix, preco_cartao')
          .eq('ativo', true).in('nome', bio)
      : Promise.resolve({ data: [], error: null }),
  ])
  if (e1 || e2) return NextResponse.json({ error: 'Erro ao consultar preços.' }, { status: 500 })

  const itens: ItemOrcamento[] = []
  for (const nome of exames) {
    const row = (tabela ?? []).find(t => t.tipo_exame === nome)
    if (!row) return NextResponse.json({ error: `Exame não encontrado: ${nome}` }, { status: 400 })
    itens.push({ nome, preco: fromComissao(row) })
  }
  for (const nome of bio) {
    const row = (bioTab ?? []).find(b => b.nome === nome)
    if (!row) return NextResponse.json({ error: `Exame de bioquímica não encontrado: ${nome}` }, { status: 400 })
    itens.push({
      nome: `Bioquímica — ${nome}`,
      preco: {
        varia_por_horario: false,
        valor_pix: Number(row.preco_pix), valor_cartao: Number(row.preco_cartao),
        valor_especial_pix: null, valor_especial_cartao: null,
      },
    })
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

import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { parseSystemSession, SESSION_COOKIE_NAME } from '@/lib/system-auth'
import { audienciaCatalogo } from '@/lib/session-helpers'

// Colunas que qualquer um pode ler. `comissao` (o repasse da BioPet por teste)
// fica FORA: é dado comercial interno e esta rota responde sem sessão.
const COLS_PUBLICAS = 'id, nome, descricao, material_padrao, metodo_padrao, ' +
                      'observacao_padrao, analitos, preco_pix, preco_cartao, ativo, ordem'
const COLS_INTERNAS = `${COLS_PUBLICAS}, comissao`

async function requireAdmin(request: NextRequest) {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (!cookie) return null
  const session = await parseSystemSession(cookie)
  if (!session || session.role !== 'admin') return null
  return session
}

// GET — catálogo aberto (clínicas/agente), mas a projeção muda com quem pergunta:
// anônimo não vê comissão, clínica vê só o repasse, equipe vê a comissão e o
// admin vê também os testes inativos.
export async function GET(request: NextRequest) {
  const audiencia = await audienciaCatalogo(request)
  const isAdmin   = audiencia === 'admin'

  let query = supabase
    .from('testes_rapidos')
    .select(audiencia === 'publico' ? COLS_PUBLICAS : COLS_INTERNAS)
    .order('ordem', { ascending: true })

  if (!isAdmin) {
    query = query.eq('ativo', true)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // O select é montado em runtime, então o supabase-js não consegue inferir a linha.
  const linhas = (data ?? []) as unknown as Record<string, unknown>[]

  // A clínica precisa do repasse (o que a BioPet recebe quando ela cobra do
  // tutor) pra montar o total na tela, mas não da comissão em si.
  if (audiencia === 'clinica') {
    return NextResponse.json(linhas.map(t => {
      const { comissao, ...publico } = t
      return { ...publico, repasse_pix: Math.max(0, Number(t.preco_pix ?? 0) - Number(comissao ?? 0)) }
    }))
  }

  return NextResponse.json(linhas)
}

// POST — autenticado admin, cria novo teste rápido
export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request)
  if (!admin) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })

  const body = await request.json().catch(() => null)
  const { nome, descricao, material_padrao, metodo_padrao, observacao_padrao,
          analitos, preco_pix, preco_cartao, comissao, ordem } = body ?? {}

  if (!nome?.trim()) return NextResponse.json({ error: 'Nome é obrigatório.' }, { status: 400 })

  const analitosNorm = Array.isArray(analitos)
    ? analitos.map((a: string) => String(a).trim()).filter(Boolean)
    : null

  const { data, error } = await supabase
    .from('testes_rapidos')
    .insert({
      nome:              nome.trim(),
      descricao:         descricao?.trim() || null,
      material_padrao:   material_padrao?.trim() || null,
      metodo_padrao:     metodo_padrao?.trim() || null,
      observacao_padrao: observacao_padrao?.trim() || null,
      analitos:          analitosNorm && analitosNorm.length > 0 ? analitosNorm : null,
      preco_pix:         Number(preco_pix)    || 0,
      preco_cartao:      Number(preco_cartao) || 0,
      comissao:          Number(comissao)     || 0,
      ordem:             Number(ordem)        || 0,
      ativo:             true,
    })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

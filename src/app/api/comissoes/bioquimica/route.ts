import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { parseSystemSession, SESSION_COOKIE_NAME } from '@/lib/system-auth'
import { registrarHistorico } from '@/lib/historico-precos'
import { audienciaCatalogo } from '@/lib/session-helpers'

// Colunas que qualquer um pode ler. `comissao` (o repasse da BioPet por exame)
// fica FORA: é dado comercial interno e esta rota responde sem sessão.
const COLS_PUBLICAS = 'id, nome, codigo, preco_pix, preco_cartao, ativo, ordem'
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
// admin vê também os sub-exames inativos.
export async function GET(request: NextRequest) {
  const audiencia = await audienciaCatalogo(request)
  const isAdmin   = audiencia === 'admin'

  let query = supabase
    .from('bioquimica_exames')
    .select(audiencia === 'publico' ? COLS_PUBLICAS : isAdmin ? `${COLS_INTERNAS}, custo` : COLS_INTERNAS)
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
    return NextResponse.json(linhas.map(e => {
      const { comissao, ...publico } = e
      return { ...publico, repasse_pix: Math.max(0, Number(e.preco_pix ?? 0) - Number(comissao ?? 0)) }
    }))
  }

  return NextResponse.json(linhas)
}

// POST — autenticado admin, cria novo sub-exame
export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request)
  if (!admin) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })

  const body = await request.json().catch(() => null)
  const { nome, codigo, preco_pix, preco_cartao, comissao, custo, ordem, ativo } = body ?? {}

  if (!nome?.trim()) return NextResponse.json({ error: 'Nome é obrigatório.' }, { status: 400 })

  const pix = Math.max(0, Number(preco_pix) || 0)
  const vazio = (v: unknown) => v === null || v === undefined || v === ''

  // Nasce inativo (só entra no agendamento quando alguém liga "Ativo").
  // Cartão vazio usa o Pix; custo vazio fica NULL ("definir" na tela).
  const { data, error } = await supabase
    .from('bioquimica_exames')
    .insert({
      nome:         nome.trim(),
      codigo:       codigo?.trim() || null,
      preco_pix:    pix,
      preco_cartao: vazio(preco_cartao) ? pix : Math.max(0, Number(preco_cartao) || 0),
      comissao:     Math.max(0, Number(comissao) || 0),
      custo:        vazio(custo) ? null : Math.max(0, Number(custo) || 0),
      ordem:        Number(ordem)         || 0,
      ativo:        ativo === true,
    })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await registrarHistorico([{ tabela: 'bioquimica_exames', registro_id: data.id, campo: '*', antes: null, depois: data }], admin.userId)
  return NextResponse.json(data, { status: 201 })
}

import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { parseSystemSession, SESSION_COOKIE_NAME } from '@/lib/system-auth'
import { podeAtivar } from '@/lib/precos-regras'
import { diffHistorico, registrarHistorico, type EntradaHistorico } from '@/lib/historico-precos'

async function requireAuth(request: NextRequest) {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (!cookie) return null
  return parseSystemSession(cookie)
}

async function requireAdmin(request: NextRequest) {
  const session = await requireAuth(request)
  if (!session || session.role !== 'admin') return null
  return session
}

export async function GET(request: NextRequest) {
  const session = await requireAuth(request)
  if (!session) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const { data, error } = await supabase
    .from('comissoes_exame')
    .select('*')
    .order('tipo_exame', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

const naoNegativo = (v: unknown) => Math.max(0, Number(v) || 0)
const precoOuNull = (v: unknown) => (v === null || v === undefined || v === '' ? null : naoNegativo(v))

// Criar novo exame. Nasce INATIVO: só aparece no agendamento e para o agente
// depois que alguém liga "Ativo" na tela de Preços (com Pix comercial > 0).
export async function POST(request: NextRequest) {
  const adminSession = await requireAdmin(request)
  if (!adminSession) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 })
  }

  const tipo = String(body.tipo_exame ?? '').trim()
  if (!tipo) return NextResponse.json({ error: 'Nome do exame é obrigatório.' }, { status: 400 })

  // Nome duplicado sem diferenciar maiúsculas ("Hemograma" x "HEMOGRAMA").
  const { data: existentes } = await supabase.from('comissoes_exame').select('tipo_exame')
  if ((existentes ?? []).some(e => String(e.tipo_exame).toLowerCase() === tipo.toLowerCase())) {
    return NextResponse.json({ error: 'Já existe um exame com esse nome.' }, { status: 409 })
  }

  const varia   = Boolean(body.varia_por_horario)
  const pixCom  = precoOuNull(body.preco_pix_comercial)
  const carCom  = precoOuNull(body.preco_cartao_comercial)
  const duracao = Number(body.duracao_minutos)

  const { data, error } = await supabase
    .from('comissoes_exame')
    .insert({
      tipo_exame:                tipo,
      custo_exame:               naoNegativo(body.custo_exame),
      comissao_laudo:            naoNegativo(body.comissao_laudo),
      comissao_clinica:          naoNegativo(body.comissao_clinica),
      comissao_extracao:         naoNegativo(body.comissao_extracao),
      varia_por_horario:         varia,
      permite_multiplo:          Boolean(body.permite_multiplo),
      preco_pix_comercial:       pixCom,
      preco_cartao_comercial:    carCom,
      // Sem variação, o fora do horário é gravado igual ao comercial.
      preco_pix_fora_horario:    varia ? precoOuNull(body.preco_pix_fora_horario)    : pixCom,
      preco_cartao_fora_horario: varia ? precoOuNull(body.preco_cartao_fora_horario) : carCom,
      duracao_minutos:           Number.isInteger(duracao) && duracao > 0 ? duracao : null,
      observacao:                String(body.observacao ?? '').trim() || null,
      ativo:                     false,
    })
    .select('*')
    .single()

  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'Já existe um exame com esse nome.' }, { status: 409 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await registrarHistorico([{ tabela: 'comissoes_exame', registro_id: data.id, campo: '*', antes: null, depois: data }], adminSession.userId)
  return NextResponse.json(data, { status: 201 })
}

// Salvar exames (o modal de edição da tela de Preços manda um por vez)
export async function PUT(request: NextRequest) {
  const adminSession = await requireAdmin(request)
  if (!adminSession) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })

  let body: {
    id: number
    custo_exame: number
    comissao_laudo: number; comissao_clinica: number; comissao_extracao: number
    varia_por_horario?: boolean
    permite_multiplo?: boolean
    ativo?: boolean
    preco_pix_comercial?: number | null; preco_cartao_comercial?: number | null
    preco_pix_fora_horario?: number | null; preco_cartao_fora_horario?: number | null
    duracao_minutos?: number | null; observacao?: string | null
  }[]
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 })
  }

  if (!Array.isArray(body)) return NextResponse.json({ error: 'Esperado array.' }, { status: 400 })

  const { data: atuais, error: errAtuais } = await supabase
    .from('comissoes_exame')
    .select('*')
    .in('id', body.map(i => i.id))
  if (errAtuais) return NextResponse.json({ error: errAtuais.message }, { status: 500 })
  const atualPorId = new Map((atuais ?? []).map(a => [a.id as number, a as Record<string, unknown>]))

  const errors: string[] = []
  const historico: EntradaHistorico[] = []
  for (const item of body) {
    const atual = atualPorId.get(item.id)
    if (!atual) { errors.push(`Exame ${item.id} não encontrado.`); continue }

    const update = {
      custo_exame:               naoNegativo(item.custo_exame),
      comissao_laudo:            naoNegativo(item.comissao_laudo),
      comissao_clinica:          naoNegativo(item.comissao_clinica),
      comissao_extracao:         naoNegativo(item.comissao_extracao),
      varia_por_horario:         item.varia_por_horario         ?? false,
      permite_multiplo:          item.permite_multiplo          ?? false,
      ativo:                     item.ativo                     ?? Boolean(atual.ativo),
      preco_pix_comercial:       item.preco_pix_comercial       ?? null,
      preco_cartao_comercial:    item.preco_cartao_comercial    ?? null,
      preco_pix_fora_horario:    item.preco_pix_fora_horario    ?? null,
      preco_cartao_fora_horario: item.preco_cartao_fora_horario ?? null,
      duracao_minutos:           item.duracao_minutos           ?? null,
      observacao:                item.observacao                ?? null,
    }

    if (update.ativo && !podeAtivar({ tipo_exame: String(atual.tipo_exame), preco_pix_comercial: update.preco_pix_comercial })) {
      errors.push(`${atual.tipo_exame}: exame ativo precisa do Pix comercial. Defina o valor ou desative.`)
      continue
    }

    const { error } = await supabase
      .from('comissoes_exame')
      .update(update)
      .eq('id', item.id)
    if (error) { errors.push(error.message); continue }
    historico.push(...diffHistorico('comissoes_exame', item.id, atual, update))
  }

  await registrarHistorico(historico, adminSession.userId)

  if (errors.length > 0) return NextResponse.json({ error: errors.join('; ') }, { status: 400 })

  const { data } = await supabase
    .from('comissoes_exame')
    .select('*')
    .order('tipo_exame', { ascending: true })

  return NextResponse.json(data)
}

// Deletar tipo de exame
export async function DELETE(request: NextRequest) {
  const adminSession = await requireAdmin(request)
  if (!adminSession) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const id = parseInt(searchParams.get('id') ?? '')
  if (!id) return NextResponse.json({ error: 'ID inválido.' }, { status: 400 })

  // Busca o nome do exame antes de deletar para limpar permissões órfãs
  const { data: exame } = await supabase
    .from('comissoes_exame')
    .select('tipo_exame')
    .eq('id', id)
    .single()

  const { data: antes } = await supabase.from('comissoes_exame').select('*').eq('id', id).maybeSingle()

  const { error } = await supabase.from('comissoes_exame').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await registrarHistorico([{ tabela: 'comissoes_exame', registro_id: id, campo: '*', antes, depois: null }], adminSession.userId)

  // Remove o tipo de exame deletado das permissões de todos os usuários
  if (exame?.tipo_exame) {
    const { data: users } = await supabase
      .from('system_users')
      .select('id, permissoes')

    for (const user of users ?? []) {
      const perms = user.permissoes as { laudos_exames?: string[] } | null
      const arr = perms?.laudos_exames ?? []
      if (arr.includes(exame.tipo_exame)) {
        await supabase
          .from('system_users')
          .update({ permissoes: { ...perms, laudos_exames: arr.filter(t => t !== exame.tipo_exame) } })
          .eq('id', user.id)
      }
    }
  }

  return NextResponse.json({ success: true })
}

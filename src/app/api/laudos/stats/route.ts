import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { parseSystemSession, SESSION_COOKIE_NAME } from '@/lib/system-auth'

export async function GET(request: NextRequest) {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (!cookie) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const session = await parseSystemSession(cookie)
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const inicio = searchParams.get('inicio')
  const fim    = searchParams.get('fim')

  if (!inicio || !fim) {
    return NextResponse.json({ error: 'Parâmetros inicio e fim são obrigatórios.' }, { status: 400 })
  }

  const { data: laudos, error: laudosError } = await supabase
    .from('laudos')
    .select('id, tipo_exame, created_at, system_user_id, preco_exame, custo_exame, valor_comissao')
    .gte('created_at', `${inicio}T00:00:00`)
    .lte('created_at', `${fim}T23:59:59`)
    .order('created_at', { ascending: true })

  if (laudosError) return NextResponse.json({ error: laudosError.message }, { status: 500 })

  const { data: systemUsers } = await supabase
    .from('system_users')
    .select('id, nome, recebe_comissao')

  const userMap: Record<number, { nome: string; recebe_comissao: boolean }> = {}
  for (const u of systemUsers ?? []) {
    userMap[u.id] = { nome: u.nome, recebe_comissao: u.recebe_comissao ?? true }
  }

  const total = laudos?.length ?? 0

  // Totais financeiros — usa o snapshot salvo no laudo (ou 0 se não preenchido)
  // Comissão só conta para usuários com recebe_comissao = true
  let receita    = 0
  let custo      = 0
  let comissao   = 0

  for (const l of laudos ?? []) {
    receita += Number(l.preco_exame ?? 0)
    custo   += Number(l.custo_exame ?? 0)
    const uid = l.system_user_id
    const recebeComissao = uid ? (userMap[uid]?.recebe_comissao ?? true) : true
    if (recebeComissao) comissao += Number(l.valor_comissao ?? 0)
  }

  const lucro = receita - custo - comissao

  // Por tipo de exame
  const porTipoMap: Record<string, { quantidade: number; receita: number; custo: number; comissao: number }> = {}
  for (const l of laudos ?? []) {
    const tipo = l.tipo_exame ?? 'Não informado'
    if (!porTipoMap[tipo]) porTipoMap[tipo] = { quantidade: 0, receita: 0, custo: 0, comissao: 0 }
    porTipoMap[tipo].quantidade++
    porTipoMap[tipo].receita   += Number(l.preco_exame    ?? 0)
    porTipoMap[tipo].custo     += Number(l.custo_exame    ?? 0)
    porTipoMap[tipo].comissao  += Number(l.valor_comissao ?? 0)
  }
  const porTipo = Object.entries(porTipoMap)
    .map(([tipo_exame, v]) => ({
      tipo_exame,
      quantidade: v.quantidade,
      receita:    v.receita,
      custo:      v.custo,
      comissao:   v.comissao,
      lucro:      v.receita - v.custo - v.comissao,
      percentual: total > 0 ? Math.round((v.quantidade / total) * 100) : 0,
    }))
    .sort((a, b) => b.quantidade - a.quantidade)

  // Por dia (gráfico)
  const porDiaMap: Record<string, number> = {}
  for (const l of laudos ?? []) {
    const dia = l.created_at.slice(0, 10)
    porDiaMap[dia] = (porDiaMap[dia] ?? 0) + 1
  }
  const porDia = Object.entries(porDiaMap)
    .map(([data, quantidade]) => ({ data, quantidade }))
    .sort((a, b) => a.data.localeCompare(b.data))

  // Por usuário do sistema
  const porVetMap: Record<number, {
    nome: string
    recebe_comissao: boolean
    quantidade: number
    receita: number
    comissao: number
    lucro: number
  }> = {}
  for (const l of laudos ?? []) {
    if (!l.system_user_id) continue
    const uid  = l.system_user_id
    const info = userMap[uid]
    if (!porVetMap[uid]) {
      porVetMap[uid] = {
        nome:            info?.nome            ?? `Usuário #${uid}`,
        recebe_comissao: info?.recebe_comissao ?? true,
        quantidade: 0,
        receita:    0,
        comissao:   0,
        lucro:      0,
      }
    }
    const preco = Number(l.preco_exame    ?? 0)
    const cus   = Number(l.custo_exame    ?? 0)
    // Comissão só é computada se o usuário recebe comissão
    const com   = porVetMap[uid].recebe_comissao ? Number(l.valor_comissao ?? 0) : 0
    porVetMap[uid].quantidade++
    porVetMap[uid].receita  += preco
    porVetMap[uid].comissao += com
    porVetMap[uid].lucro    += preco - cus - com
  }
  const porVet = Object.values(porVetMap).sort((a, b) => b.quantidade - a.quantidade)

  return NextResponse.json({
    total,
    receita,
    custo,
    comissao,
    lucro,
    porTipo,
    porDia,
    porVet,
  })
}

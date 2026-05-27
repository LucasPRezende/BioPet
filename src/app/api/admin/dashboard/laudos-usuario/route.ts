import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { parseSystemSession, SESSION_COOKIE_NAME } from '@/lib/system-auth'

export async function GET(request: NextRequest) {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (!cookie) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  const session = await parseSystemSession(cookie)
  if (!session || session.role !== 'admin') return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })

  const params    = request.nextUrl.searchParams
  const usuarioId = params.get('usuario_id')
  const inicio    = params.get('inicio')
  const fim       = params.get('fim')

  if (!usuarioId || !inicio || !fim) {
    return NextResponse.json({ error: 'usuario_id, inicio e fim são obrigatórios.' }, { status: 400 })
  }

  const { data: laudos, error } = await supabase
    .from('laudos')
    .select('id, tipo_exame, criado_em, agendamento_id, nome_pet, preco_exame, valor_comissao, agendamentos(pets(nome), tutores(nome))')
    .eq('system_user_id', Number(usuarioId))
    .gte('criado_em', `${inicio}T00:00:00`)
    .lte('criado_em', `${fim}T23:59:59`)
    .order('criado_em', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const comAg: object[] = []
  const semAg: object[] = []

  for (const l of laudos ?? []) {
    const agRaw = l.agendamentos
    const agObj = Array.isArray(agRaw) ? agRaw[0] : agRaw
    const ag    = agObj as { pets: { nome: string } | { nome: string }[] | null; tutores: { nome: string | null } | { nome: string | null }[] | null } | null
    const petNome   = ag?.pets    ? (Array.isArray(ag.pets)    ? (ag.pets[0]?.nome    ?? null) : ag.pets?.nome)    : null
    const tutorNome = ag?.tutores ? (Array.isArray(ag.tutores) ? (ag.tutores[0]?.nome ?? null) : ag.tutores?.nome) : null
    const entry = {
      id:             l.id,
      tipo_exame:     l.tipo_exame,
      criado_em:      l.criado_em,
      agendamento_id: l.agendamento_id,
      pet_nome:       petNome ?? l.nome_pet ?? '—',
      tutor_nome:     tutorNome ?? '—',
      preco_exame:    Number(l.preco_exame ?? 0),
      valor_comissao: Number(l.valor_comissao ?? 0),
    }
    if (l.agendamento_id) comAg.push(entry)
    else                  semAg.push(entry)
  }

  return NextResponse.json({ com_agendamento: comAg, sem_agendamento: semAg })
}

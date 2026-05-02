import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { parseSystemSession, SESSION_COOKIE_NAME } from '@/lib/system-auth'

export async function GET(request: NextRequest) {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (!cookie) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  const session = await parseSystemSession(cookie)
  if (!session) return NextResponse.json({ error: 'Sessão inválida.' }, { status: 401 })

  const busca = request.nextUrl.searchParams.get('busca')?.trim()
  if (!busca) return NextResponse.json([])

  // Busca tutores e pets pelo termo
  const [{ data: tutores }, { data: pets }] = await Promise.all([
    supabase.from('tutores').select('id').or(`nome.ilike.%${busca}%,telefone.ilike.%${busca}%`).limit(20),
    supabase.from('pets').select('id').ilike('nome', `%${busca}%`).limit(20),
  ])

  const tutorIds = (tutores ?? []).map(t => t.id)
  const petIds   = (pets   ?? []).map(p => p.id)
  if (tutorIds.length === 0 && petIds.length === 0) return NextResponse.json([])

  // Tipos de exame que permitem revisão
  const { data: configs } = await supabase
    .from('revisao_config')
    .select('tipo_exame, permite_revisao, prazo_dias, max_revisoes')
    .eq('permite_revisao', true)

  const tiposPermitidos = (configs ?? []).map(c => c.tipo_exame)
  if (tiposPermitidos.length === 0) return NextResponse.json([])

  const orClauses = [
    tutorIds.length > 0 ? `tutor_id.in.(${tutorIds.join(',')})` : null,
    petIds.length   > 0 ? `pet_id.in.(${petIds.join(',')})` : null,
  ].filter(Boolean).join(',')

  // Agendamentos originais (não são revisões, tipo permitido)
  const { data: ags, error } = await supabase
    .from('agendamentos')
    .select('id, tipo_exame, data_hora, status, tutores(nome, telefone), pets(nome, especie)')
    .or(orClauses)
    .eq('is_revisao', false)
    .in('tipo_exame', tiposPermitidos)
    .order('data_hora', { ascending: false })
    .limit(20)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const agIds = (ags ?? []).map(a => a.id)
  if (agIds.length === 0) return NextResponse.json([])

  // Conta revisões ativas (não canceladas) por agendamento original em lote
  const { data: revisoesAtivas } = await supabase
    .from('agendamentos')
    .select('agendamento_original_id')
    .in('agendamento_original_id', agIds)
    .eq('is_revisao', true)
    .in('status', ['agendado', 'em atendimento', 'concluído'])

  const contadorRevisoes: Record<number, number> = {}
  for (const r of revisoesAtivas ?? []) {
    const id = r.agendamento_original_id
    if (id) contadorRevisoes[id] = (contadorRevisoes[id] ?? 0) + 1
  }

  const configMap = Object.fromEntries((configs ?? []).map(c => [c.tipo_exame, c]))
  const agora = new Date()

  const resultado = (ags ?? []).map(ag => {
    const cfg            = configMap[ag.tipo_exame]
    const dataOriginal   = new Date(ag.data_hora)
    const prazoLimite    = new Date(dataOriginal.getTime() + cfg.prazo_dias * 86400000)
    const prazo_ok       = agora <= prazoLimite
    const revisoes_ativas = contadorRevisoes[ag.id] ?? 0
    const limite_ok      = revisoes_ativas < cfg.max_revisoes
    const pode_agendar   = prazo_ok && limite_ok

    let motivo_bloqueio: string | null = null
    if (!prazo_ok) {
      motivo_bloqueio = `Prazo expirado em ${prazoLimite.toLocaleDateString('pt-BR')}`
    } else if (!limite_ok) {
      motivo_bloqueio = revisoes_ativas === 1
        ? 'Já possui uma revisão agendada ou concluída'
        : `Já possui ${revisoes_ativas} revisões (limite: ${cfg.max_revisoes})`
    }

    return {
      ...ag,
      prazo_ok,
      prazo_limite:     prazoLimite.toLocaleDateString('pt-BR'),
      revisoes_ativas,
      max_revisoes:     cfg.max_revisoes,
      pode_agendar,
      motivo_bloqueio,
    }
  })

  return NextResponse.json(resultado)
}

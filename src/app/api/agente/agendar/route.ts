import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { verifyAgentKey } from '@/lib/agent-auth'
import {
  verificarConflito,
  precificarExames,
  insertExames,
  recalcularTotal,
  type ExameInput,
} from '@/lib/agendamento-helpers'
import type { FormaPagamento } from '@/lib/pricing'
import { raioXPrecisaAtendente, type ItemRaioX } from '@/lib/agente/raiox'
import { exameBloqueado } from '@/lib/agente/exames-guard'

type ExameAgente = ItemRaioX

/**
 * Resolve a duração de cada tipo de exame pela tabela comissoes_exame (não confia
 * na duração que a IA mandar). Default 30 min se não houver cadastro.
 */
async function resolverDuracoes(tipos: string[]): Promise<Map<string, number>> {
  const m = new Map<string, number>()
  if (tipos.length === 0) return m
  const { data } = await supabase
    .from('comissoes_exame')
    .select('tipo_exame, duracao_minutos')
    .in('tipo_exame', Array.from(new Set(tipos)))
  for (const r of data ?? []) m.set(r.tipo_exame, r.duracao_minutos ?? 30)
  return m
}

const DIAS = [
  'domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado',
]

function formatDataHora(isoStr: string): string {
  const [datePart, timePart = '00:00'] = isoStr.split('T')
  const [year, month, day] = datePart.split('-').map(Number)
  const [hour, minute]     = timePart.split(':').map(Number)
  const d  = new Date(year, month - 1, day, hour, minute)
  const dd = String(day).padStart(2, '0')
  const mm = String(month).padStart(2, '0')
  const hh = String(hour).padStart(2, '0')
  const mi = String(minute).padStart(2, '0')
  return `${DIAS[d.getDay()]} ${dd}/${mm} às ${hh}:${mi}`
}

/**
 * Registra uma notificação de "Novo agendamento" no submenu /admin/notificacoes
 * (tipo_evento 'agendamento' — já tem ícone/filtro/rótulo na UI). Best-effort:
 * nunca derruba o agendamento se a notificação falhar.
 */
async function registrarNotificacaoAgendamento(
  agendamentoId: number,
  tutorId: number,
  petId: number | null,
  tipoExame: string,
  dataHora: string,
  valor: number | null,
  origemLabel: string,
): Promise<void> {
  try {
    const [{ data: tutor }, petRes] = await Promise.all([
      supabase.from('tutores').select('nome, telefone').eq('id', tutorId).maybeSingle(),
      petId
        ? supabase.from('pets').select('nome').eq('id', petId).maybeSingle()
        : Promise.resolve({ data: null }),
    ])

    const petNome = (petRes as { data: { nome: string } | null }).data?.nome
    const resumo = [
      tipoExame,
      petNome ? `pet ${petNome}` : null,
      formatDataHora(dataHora),
      valor != null ? `R$ ${valor}` : null,
      `via ${origemLabel}`,
    ].filter(Boolean).join(' • ')

    await supabase.from('notificacoes').insert({
      telefone:         tutor?.telefone ?? 'desconhecido',
      nome_tutor:       tutor?.nome ?? null,
      motivo:           'agendamento',
      tipo_evento:      'agendamento',
      mensagem_cliente: resumo,
      agendamento_id:   agendamentoId,
    })
  } catch (e) {
    console.error('[agente/agendar] falha ao registrar notificação:', e)
  }
}

export async function POST(request: NextRequest) {
  if (!verifyAgentKey(request)) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const {
    tutor_id, pet_id, tipo_exame, data_hora,
    duracao_minutos, forma_pagamento,
    google_calendar_id, observacoes, status, origem, veterinario_id,
    exames,
  } = body ?? {}

  // Lista de exames: usa `exames` (multi, com posição/descrição) se vier; senão
  // cai no `tipo_exame` único (compatibilidade).
  const listaExames: ExameAgente[] = Array.isArray(exames) && exames.length > 0
    ? exames
    : tipo_exame
      ? [{ tipo_exame, duracao_minutos, descricao: null }]
      : []

  if (!tutor_id || listaExames.length === 0 || !data_hora) {
    return NextResponse.json(
      { error: 'Campos "tutor_id", "tipo_exame" (ou "exames") e "data_hora" são obrigatórios.' },
      { status: 400 },
    )
  }

  // Raio-X de mais de um estudo é julgamento clínico — não agendar pela IA.
  if (raioXPrecisaAtendente(listaExames)) {
    return NextResponse.json(
      {
        error: 'precisa_atendente',
        mensagem: 'Raio-X de mais de uma região/estudo deve ser finalizado por um atendente (definição de estudos e preço). Use transferir_humano.',
      },
      { status: 422 },
    )
  }

  // Só agenda exames que existem na tabela de preços E não estão bloqueados.
  // Pega sub-exames de bioquímica (TGP, TGO...), nomes inventados e desativados.
  const [{ data: comissoesRows }, { data: cfgRow }] = await Promise.all([
    supabase.from('comissoes_exame').select('tipo_exame'),
    supabase.from('configuracoes_agente').select('exames_nao_agendaveis').order('id').limit(1).maybeSingle(),
  ])
  const validos = (comissoesRows ?? []).map(r => r.tipo_exame as string)
  const naoAgendaveis = (cfgRow?.exames_nao_agendaveis as string[] | null) ?? []
  const bloqueado = exameBloqueado(listaExames.map(e => e.tipo_exame), validos, naoAgendaveis)
  if (bloqueado) {
    return NextResponse.json(
      {
        error: 'precisa_atendente',
        mensagem: `O exame "${bloqueado}" não pode ser agendado automaticamente — deve ser feito por um atendente. Use transferir_humano.`,
      },
      { status: 422 },
    )
  }

  // Backend é a fonte de verdade do preço e da duração.
  const forma: FormaPagamento = String(forma_pagamento ?? '').toLowerCase().includes('cartao') ? 'cartao' : 'pix'
  const duracoes = await resolverDuracoes(listaExames.map(e => e.tipo_exame))
  const entrada: ExameInput[] = listaExames.map(e => ({
    tipo_exame:      e.tipo_exame,
    duracao_minutos: e.duracao_minutos ?? duracoes.get(e.tipo_exame) ?? 30,
    valor:           0, // recalculado por precificarExames
    descricao:       e.descricao ?? null,
  }))

  const precificados = await precificarExames(entrada, {
    forma, gratuito: false, bio: [], dataHora: data_hora, encaixe: false,
  })
  const totalDuracao = entrada.reduce((s, e) => s + (e.duracao_minutos ?? 0), 0)
  const tipoExameStr = listaExames.map(e => e.tipo_exame).join(', ')

  // Verifica conflito de horário
  const conflito = await verificarConflito(data_hora, totalDuracao)
  if (conflito) {
    return NextResponse.json(
      { error: 'Já existe um agendamento neste horário.', conflito_id: conflito },
      { status: 409 },
    )
  }

  // Blindagem: a IA às vezes ALUCINA um veterinario_id (ex.: mandou id 1, que não
  // existe → FK violada → 500). Se o id não existir na tabela, agenda SEM vet em
  // vez de quebrar o agendamento inteiro (o nome fica nas observações do encaminhamento).
  let vetIdValido: number | null = null
  if (veterinario_id) {
    const { data: vetRow } = await supabase
      .from('veterinarios')
      .select('id')
      .eq('id', Number(veterinario_id))
      .maybeSingle()
    if (vetRow) vetIdValido = Number(veterinario_id)
    else console.warn(`[agente/agendar] veterinario_id ${veterinario_id} inexistente — agendando sem vet`)
  }

  const { data, error } = await supabase
    .from('agendamentos')
    .insert({
      tutor_id:           Number(tutor_id),
      pet_id:             pet_id ? Number(pet_id) : null,
      tipo_exame:         tipoExameStr,
      data_hora,
      duracao_minutos:    totalDuracao,
      valor:              null, // definido por recalcularTotal abaixo
      veterinario_id:     vetIdValido,
      forma_pagamento:    forma_pagamento ?? 'a confirmar',
      google_calendar_id: google_calendar_id ?? null,
      observacoes:        observacoes ?? null,
      status:             status ?? 'agendado',
      origem:             origem ?? 'agente',
      system_user_id:     process.env.AGENT_USER_ID ? Number(process.env.AGENT_USER_ID) : null,
    })
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Grava cada exame (com a posição em `descricao`) e fecha o total pela soma.
  await insertExames(data.id, precificados)
  const total = await recalcularTotal(data.id)

  // Notifica o submenu /admin/notificacoes (agendamentos do agente/clínica).
  await registrarNotificacaoAgendamento(
    data.id,
    Number(tutor_id),
    pet_id ? Number(pet_id) : null,
    tipoExameStr,
    data_hora,
    total,
    origem === 'agente' ? 'assistente (WhatsApp)' : (origem ?? 'sistema'),
  )

  return NextResponse.json({ agendamento_id: data.id, valor_total: total }, { status: 201 })
}

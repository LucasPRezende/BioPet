import { supabase } from './supabase'

export interface ExameInput {
  tipo_exame: string
  duracao_minutos: number
  valor: number
  horario_especial?: boolean
}

export interface BioquimicaInput {
  bioquimica_exame_id: number
  valor_pix: number
  valor_cartao: number
}

export function normalizeTelefone(telefone: string): string {
  const digits = String(telefone).replace(/\D/g, '')
  return digits.startsWith('55') ? digits : `55${digits}`
}

// Retorna o id do agendamento conflitante, ou null se não houver conflito.
export async function verificarConflito(
  dataHora: string,
  duracaoMin: number,
  { ignorarEncaixe = false }: { ignorarEncaixe?: boolean } = {},
): Promise<number | null> {
  const diaStr  = dataHora.split('T')[0]
  const novaIni = new Date(dataHora)
  const novaFim = new Date(novaIni.getTime() + duracaoMin * 60_000)

  const { data: existentes } = await supabase
    .from('agendamentos')
    .select('id, data_hora, duracao_minutos, encaixe')
    .gte('data_hora', `${diaStr}T00:00:00`)
    .lte('data_hora', `${diaStr}T23:59:59`)
    .neq('status', 'cancelado')

  const conflito = (existentes ?? []).find(ag => {
    if (ignorarEncaixe && ag.encaixe) return false
    const agIni = new Date(ag.data_hora)
    const agFim = new Date(agIni.getTime() + (ag.duracao_minutos ?? 30) * 60_000)
    return novaIni < agFim && novaFim > agIni
  })

  return conflito?.id ?? null
}

// Busca tutor pelo telefone normalizado; cria se não existir. Lança se o insert falhar.
export async function upsertTutor(telNorm: string, nome?: string): Promise<number> {
  const { data: existing } = await supabase
    .from('tutores')
    .select('id, nome')
    .eq('telefone', telNorm)
    .maybeSingle()

  if (existing) {
    if (nome && !existing.nome) {
      await supabase.from('tutores').update({ nome }).eq('id', existing.id)
    }
    return existing.id
  }

  const { data: created, error } = await supabase
    .from('tutores')
    .insert({ telefone: telNorm, nome: nome ?? null })
    .select('id')
    .single()

  if (error) throw new Error(error.message)
  return created.id
}

export async function insertExames(agendamentoId: number, exames: ExameInput[]): Promise<void> {
  if (exames.length === 0) return
  await supabase.from('agendamento_exames').insert(
    exames.map(e => ({
      agendamento_id:   agendamentoId,
      tipo_exame:       e.tipo_exame,
      duracao_minutos:  e.duracao_minutos,
      valor:            e.valor,
      horario_especial: e.horario_especial ?? false,
    })),
  )
}

export async function insertBioquimica(agendamentoId: number, bio: BioquimicaInput[]): Promise<void> {
  if (bio.length === 0) return
  await supabase.from('agendamento_bioquimica').insert(
    bio.map(b => ({
      agendamento_id:      agendamentoId,
      bioquimica_exame_id: b.bioquimica_exame_id,
      valor_pix:           b.valor_pix,
      valor_cartao:        b.valor_cartao,
    })),
  )
}

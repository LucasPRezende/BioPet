import { supabase } from './supabase'
import {
  precoExame,
  precoBioquimica,
  valorLiquido,
  fromComissao,
  isHorarioEspecial,
  type FormaPagamento,
} from './pricing'
import { gerarPreferenciaMp, expirarPreferenciaMp } from './mp-preference'
import { gerarPixToken } from './pix-token'

export interface ExameInput {
  tipo_exame: string
  duracao_minutos: number
  valor: number          // valor líquido (preço de tabela − desconto)
  desconto?: number      // desconto em R$ aplicado a este exame (default 0)
  horario_especial?: boolean
  descricao?: string | null
}

export interface BioquimicaInput {
  bioquimica_exame_id: number
  valor_pix: number
  valor_cartao: number
  comissao?: number
}

export interface TesteRapidoInput {
  teste_rapido_id: number
  valor_pix: number
  valor_cartao: number
  comissao?: number
}

export { normalizeTelefone } from './telefone'

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
export async function upsertTutor(telNorm: string, nome?: string, cpf?: string): Promise<number> {
  const { data: existing } = await supabase
    .from('tutores')
    .select('id, nome, cpf')
    .eq('telefone', telNorm)
    .maybeSingle()

  if (existing) {
    const updates: Record<string, unknown> = {}
    if (nome && !existing.nome) updates.nome = nome
    if (cpf && !existing.cpf)   updates.cpf  = cpf
    if (Object.keys(updates).length > 0) {
      await supabase.from('tutores').update(updates).eq('id', existing.id)
    }
    return existing.id
  }

  const { data: created, error } = await supabase
    .from('tutores')
    .insert({ telefone: telNorm, nome: nome ?? null, cpf: cpf ?? null })
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
      desconto:         e.desconto ?? 0,
      horario_especial: e.horario_especial ?? false,
      descricao:        e.descricao ?? null,
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
      comissao:            b.comissao ?? 0,
    })),
  )
}

export async function insertTestesRapidos(agendamentoId: number, testes: TesteRapidoInput[]): Promise<void> {
  if (testes.length === 0) return
  await supabase.from('agendamento_testes_rapidos').insert(
    testes.map(t => ({
      agendamento_id:  agendamentoId,
      teste_rapido_id: t.teste_rapido_id,
      valor_pix:       t.valor_pix,
      valor_cartao:    t.valor_cartao,
      comissao:        t.comissao ?? 0,
    })),
  )
}

// ─── Pricing como fonte de verdade no backend (Fase 2) ──────────────────────────

const COMISSAO_COLS =
  'tipo_exame, varia_por_horario, preco_pix_comercial, preco_cartao_comercial, ' +
  'preco_pix_fora_horario, preco_cartao_fora_horario'

interface ComissaoRowDb {
  tipo_exame:                string
  varia_por_horario:         boolean
  preco_pix_comercial:       number | null
  preco_cartao_comercial:    number | null
  preco_pix_fora_horario:    number | null
  preco_cartao_fora_horario: number | null
}

/**
 * Determina no backend se o agendamento cai em horário especial (fonte de verdade),
 * sem confiar em flag do cliente. Espelha o cálculo do front: usa os feriados da
 * tabela `feriados` + o horário comercial de `system_config`
 * (`horario_especial_inicio`/`_fim`, defaults 08:00–17:00), a partir do `data_hora`
 * e da duração total. Encaixe → hora vazia (mesma semântica do front: a checagem
 * passa a depender só da data — fim de semana/feriado).
 */
export async function calcularEspecial(
  dataHora: string,
  totalDuracao: number,
  encaixe: boolean,
): Promise<boolean> {
  const [datePart, timePart = ''] = dataHora.split('T')
  const hora = encaixe ? '' : timePart.slice(0, 5)

  const [{ data: feriadosRows }, { data: horarioRows }] = await Promise.all([
    supabase.from('feriados').select('data'),
    supabase.from('system_config').select('key, value').in('key', ['horario_especial_inicio', 'horario_especial_fim']),
  ])

  const feriados = (feriadosRows ?? []).map((f: { data: string }) => f.data)
  const map = Object.fromEntries((horarioRows ?? []).map((r: { key: string; value: string }) => [r.key, r.value]))
  const inicio = map['horario_especial_inicio'] ?? '08:00'
  const fim    = map['horario_especial_fim']    ?? '17:00'

  return isHorarioEspecial(hora, totalDuracao, datePart, feriados, fim, inicio)
}

/**
 * Recalcula o valor de cada exame a partir de `comissoes_exame` (fonte de verdade),
 * em vez de confiar no `valor` enviado pelo cliente. Aplica o desconto por exame.
 *  - gratuito → todos os valores 0 (não consulta a tabela). Ver [[gratuidade-admin-only]].
 *  - Bioquímica → soma dos sub-exames (`bio`), conforme a forma.
 *  - tipo sem comissão cadastrada → cai para o `valor` enviado (defensivo).
 *
 * O `horario_especial` é RECALCULADO no backend via {@link calcularEspecial}
 * (a partir de `dataHora`/`encaixe`/duração total) — o flag enviado pelo cliente é
 * ignorado, fechando a brecha de manipular o preço mandando especial=false.
 */
export async function precificarExames(
  exames: ExameInput[],
  opts: {
    forma: FormaPagamento; gratuito: boolean; bio: BioquimicaInput[]
    testesRapidos?: TesteRapidoInput[]; dataHora: string; encaixe: boolean
    /** Pagamento pela clínica: o repasse à BioPet é preço − comissão da clínica. */
    pagamentoClinica?: boolean
  },
): Promise<ExameInput[]> {
  const totalDuracao = exames.reduce((s, e) => s + (e.duracao_minutos ?? 0), 0)
  const especial = await calcularEspecial(opts.dataHora, totalDuracao, opts.encaixe)

  const AGRUPADORES = new Set(['Bioquímica', 'Teste Rápido'])
  const tiposTabela = Array.from(
    new Set(exames.filter(e => !AGRUPADORES.has(e.tipo_exame)).map(e => e.tipo_exame)),
  )

  const comMap = new Map<string, ComissaoRowDb>()
  if (!opts.gratuito && tiposTabela.length > 0) {
    const { data } = await supabase
      .from('comissoes_exame')
      .select(COMISSAO_COLS)
      .in('tipo_exame', tiposTabela)
    for (const c of (data ?? []) as unknown as ComissaoRowDb[]) comMap.set(c.tipo_exame, c)
  }

  // Comissão da clínica coletora: só abate o repasse quando o pagamento é pela clínica.
  const comissaoBio   = opts.pagamentoClinica ? opts.bio.reduce((s, b) => s + Number(b.comissao ?? 0), 0) : 0
  const comissaoTeste = opts.pagamentoClinica ? (opts.testesRapidos ?? []).reduce((s, t) => s + Number(t.comissao ?? 0), 0) : 0

  const brutoBio = opts.gratuito
    ? 0
    : Math.max(0, precoBioquimica(
        opts.bio.map(b => ({ valor_pix: Number(b.valor_pix), valor_cartao: Number(b.valor_cartao) })),
        opts.forma,
      ) - comissaoBio)

  const brutoTeste = opts.gratuito
    ? 0
    : Math.max(0, precoBioquimica(
        (opts.testesRapidos ?? []).map(t => ({ valor_pix: Number(t.valor_pix), valor_cartao: Number(t.valor_cartao) })),
        opts.forma,
      ) - comissaoTeste)

  return exames.map(e => {
    const desconto = opts.gratuito ? 0 : Number(e.desconto ?? 0)
    let bruto = 0
    if (!opts.gratuito) {
      if (e.tipo_exame === 'Bioquímica') {
        bruto = brutoBio
      } else if (e.tipo_exame === 'Teste Rápido') {
        bruto = brutoTeste
      } else {
        const com = comMap.get(e.tipo_exame)
        bruto = com
          ? precoExame(fromComissao(com), { forma: opts.forma, especial })
          : Number(e.valor ?? 0)
      }
    }
    return {
      tipo_exame:       e.tipo_exame,
      duracao_minutos:  e.duracao_minutos,
      valor:            opts.gratuito ? 0 : valorLiquido(bruto, desconto),
      desconto,
      horario_especial: especial,
      descricao:        e.descricao ?? null,
    }
  })
}

/**
 * Re-deriva e persiste `agendamentos.valor` a partir das partes
 * (`agendamento_exames.valor`, já líquidos) — fonte única de verdade do total,
 * a ser chamada após qualquer mudança de exames. Respeita gratuidade: forma
 * 'gratuito' → 0 sem somar a tabela. Mantém a convenção de gravar `null` quando 0.
 * Retorna o total calculado.
 */
export async function recalcularTotal(agendamentoId: number): Promise<number> {
  const { data: ag } = await supabase
    .from('agendamentos')
    .select('forma_pagamento')
    .eq('id', agendamentoId)
    .single()

  let total = 0
  if ((ag?.forma_pagamento ?? '').toLowerCase() !== 'gratuito') {
    const { data: exames } = await supabase
      .from('agendamento_exames')
      .select('valor')
      .eq('agendamento_id', agendamentoId)
    total = (exames ?? []).reduce((s, e) => s + Number(e.valor ?? 0), 0)
  }

  await supabase
    .from('agendamentos')
    .update({ valor: total > 0 ? total : null })
    .eq('id', agendamentoId)

  return total
}

// ─── Reconciliação do link de pagamento (Fase 2 / decisão jun/2026) ─────────────

export interface EstadoPagamento {
  forma_pagamento:       string | null
  entrega_pagamento:     string | null
  pagamento_responsavel: string | null
  valor:                 number | null
  status_pagamento:      string | null
  mp_preference_id:      string | null
  mp_init_point:         string | null
  pix_token:             string | null
}

type TipoLink = 'cartao' | 'pix' | 'nenhum'

/** Que link o agendamento DEVE ter, dado (forma, entrega, responsável). */
function linkDesejado(e: Pick<EstadoPagamento, 'forma_pagamento' | 'entrega_pagamento' | 'pagamento_responsavel'>): TipoLink {
  const forma = (e.forma_pagamento ?? '').toLowerCase()
  if (e.pagamento_responsavel === 'clinica')   return 'nenhum'
  if (forma === 'gratuito')                     return 'nenhum'
  if ((e.entrega_pagamento ?? '') !== 'link')   return 'nenhum'   // presencial / não definido
  if (forma.includes('cartao'))                 return 'cartao'
  if (forma.includes('pix'))                    return 'pix'
  return 'nenhum'                                                  // 'a confirmar' etc.
}

/**
 * Reconcilia o link de pagamento guardado com o estado atual do agendamento, após
 * uma edição. Mantém o invariante: o link gravado está sempre válido e batendo com
 * (forma, entrega, valor), ou ausente — nunca defasado-mas-válido. Regra:
 *  - JÁ PAGO (pago/pago_clinica) → não mexe em nada (mudança de valor é tratada
 *    manualmente pela equipe; não gera nem invalida link).
 *  - cartão → expira a preferência MP antiga + gera nova (quando virou cartão OU o
 *    valor mudou; se continuou cartão com mesmo valor, mantém o link).
 *  - pix    → expira MP antigo (se havia) + garante o link de pix (o pix se
 *    auto-valida pelo valor atual; não precisa regerar por mudança de valor).
 *  - nenhum (presencial/gratuito/clínica) → expira MP antigo (se havia) + limpa.
 * Best-effort: falha ao gerar/expirar no MP NÃO derruba a edição (deixa sem link).
 */
export async function reconciliarLinkPagamento(
  agendamentoId: number,
  antes: EstadoPagamento,
  depois: EstadoPagamento,
): Promise<void> {
  if (['pago', 'pago_clinica'].includes((depois.status_pagamento ?? '').toLowerCase())) return

  const desejado      = linkDesejado(depois)
  const desejadoAntes = linkDesejado(antes)
  const valorMudou    = Math.abs(Number(depois.valor ?? 0) - Number(antes.valor ?? 0)) > 0.01
  const expirarAntigo = async () => { if (antes.mp_preference_id) await expirarPreferenciaMp(antes.mp_preference_id) }
  const limpar = () =>
    supabase.from('agendamentos')
      .update({ mp_init_point: null, mp_preference_id: null, pix_token: null })
      .eq('id', agendamentoId)

  if (desejado === 'cartao') {
    if (desejadoAntes === 'cartao' && !valorMudou) return   // mesmo cartão, mesmo valor → mantém
    await expirarAntigo()
    try {
      await gerarPreferenciaMp(agendamentoId)               // grava mp_init_point/mp_preference_id
    } catch (err) {
      console.error('[reconciliarLink] falha ao gerar preferência MP:', err instanceof Error ? err.message : err)
      await limpar()                                        // best-effort: deixa sem link
    }
  } else if (desejado === 'pix') {
    if (desejadoAntes === 'pix') return                     // já era pix → mantém (auto-valida)
    await expirarAntigo()
    const pixToken = antes.pix_token ?? gerarPixToken()
    await supabase.from('agendamentos')
      .update({ pix_token: pixToken, mp_init_point: `${process.env.NEXT_PUBLIC_URL}/pagamento/pix/${pixToken}`, mp_preference_id: null })
      .eq('id', agendamentoId)
  } else {
    // nenhum: presencial / gratuito / clínica
    if (antes.mp_init_point || antes.mp_preference_id || antes.pix_token) {
      await expirarAntigo()
      await limpar()
    }
  }
}

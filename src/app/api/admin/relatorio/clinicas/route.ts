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

  const params = request.nextUrl.searchParams
  const inicio = params.get('inicio') ?? new Date().toLocaleDateString('en-CA')
  const fim    = params.get('fim')    ?? new Date().toLocaleDateString('en-CA')

  const { data, error } = await supabase
    .from('agendamentos')
    .select(`
      id, clinica_id, comissao_clinica_id, comissao_clinica_confirmada, comissao_clinica_em,
      valor, status_pagamento, tipo_exame, data_hora, pagamento_responsavel, repasse_confirmado, repasse_em,
      clinicas!agendamentos_clinica_id_fkey(nome),
      clinica_comissao:clinicas!agendamentos_comissao_clinica_id_fkey(nome),
      pets(nome), tutores(nome),
      agendamento_testes_rapidos(comissao, testes_rapidos(nome)),
      agendamento_bioquimica(comissao, bioquimica_exames(nome))
    `)
    .or('clinica_id.not.is.null,comissao_clinica_id.not.is.null')
    .neq('status', 'cancelado')
    .gte('data_hora', `${inicio}T00:00:00`)
    .lte('data_hora', `${fim}T23:59:59`)
    .order('data_hora', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Agrupa por clínica
  const map: Record<number, {
    clinica_id:       number
    clinica_nome:     string
    total:            number
    total_valor:      number
    a_receber:        number
    recebido:         number
    repasse_pendente: number
    pendente_mp:      number
    comissao_pendente: number
    comissao_paga:     number
    agendamentos: {
      id:                          number
      tipo_exame:                  string
      data_hora:                   string
      valor:                       number | null
      status_pagamento:            string
      pet_nome:                    string
      tutor_nome:                  string
      pagamento_responsavel:       string | null
      repasse_confirmado:          boolean
      repasse_em:                  string | null
      comissao_clinica:            boolean
      comissao_valor:              number
      comissao_exame:              string
      comissao_clinica_confirmada: boolean
      comissao_clinica_em:         string | null
    }[]
  }> = {}

  for (const ag of data ?? []) {
    const petNome  = (Array.isArray(ag.pets)    ? ag.pets[0]    : ag.pets    as { nome: string } | null)?.nome ?? '—'
    const tutNome  = (Array.isArray(ag.tutores) ? ag.tutores[0] : ag.tutores as { nome: string } | null)?.nome ?? '—'

    // Comissão devida a uma clínica parceira quando a BioPet recebe direto do
    // tutor (não é o mesmo fluxo do repasse, que já desconta a comissão do
    // valor repassado — ver migration_v43).
    const isComissaoClinica = ag.comissao_clinica_id != null
    type SubTeste = { comissao: number; testes_rapidos: { nome: string } | { nome: string }[] | null }
    type SubBio   = { comissao: number; bioquimica_exames: { nome: string } | { nome: string }[] | null }
    const nomeSub = (rel: { nome: string } | { nome: string }[] | null) => (Array.isArray(rel) ? rel[0] : rel)?.nome
    const testesComComissao = isComissaoClinica
      ? (Array.isArray(ag.agendamento_testes_rapidos) ? ag.agendamento_testes_rapidos as SubTeste[] : []).filter(t => Number(t.comissao ?? 0) > 0)
      : []
    const bioComComissao = isComissaoClinica
      ? (Array.isArray(ag.agendamento_bioquimica) ? ag.agendamento_bioquimica as SubBio[] : []).filter(b => Number(b.comissao ?? 0) > 0)
      : []
    const comissaoValor = testesComComissao.reduce((s, t) => s + Number(t.comissao ?? 0), 0)
      + bioComComissao.reduce((s, b) => s + Number(b.comissao ?? 0), 0)
    // Nome do(s) sub-exame(s) que realmente geram a comissão — não o tipo_exame
    // do agendamento inteiro, que pode incluir outros exames sem comissão
    // (ex.: Raio-X + Teste Rápido no mesmo agendamento).
    const comissaoExameNome = [
      ...testesComComissao.map(t => nomeSub(t.testes_rapidos)).filter(Boolean),
      ...bioComComissao.map(b => nomeSub(b.bioquimica_exames)).filter(Boolean),
    ].join(', ') || ag.tipo_exame

    // Linha a agrupar: prioriza clinica_id (repasse), cai para comissao_clinica_id
    // quando a BioPet recebeu direto e não há clinica_id (agendamento admin com
    // clínica de comissão selecionada, sem envolvimento de repasse).
    const cid = (ag.clinica_id ?? ag.comissao_clinica_id) as number | null
    if (cid == null) continue

    const nomeClinicaId  = (Array.isArray(ag.clinicas) ? ag.clinicas[0] : ag.clinicas as { nome: string } | null)?.nome
    const nomeComissaoId = (Array.isArray(ag.clinica_comissao) ? ag.clinica_comissao[0] : ag.clinica_comissao as { nome: string } | null)?.nome
    const nome = ag.clinica_id != null ? (nomeClinicaId ?? 'Clínica sem nome') : (nomeComissaoId ?? 'Clínica sem nome')

    const valor = ag.valor ?? 0

    if (!map[cid]) {
      map[cid] = {
        clinica_id: cid, clinica_nome: nome, total: 0, total_valor: 0, a_receber: 0, recebido: 0,
        repasse_pendente: 0, pendente_mp: 0, comissao_pendente: 0, comissao_paga: 0, agendamentos: [],
      }
    }

    map[cid].total++
    map[cid].total_valor += valor

    const isRepasseClinica = ag.pagamento_responsavel === 'clinica'

    if (isRepasseClinica && ag.status_pagamento === 'a_receber')    map[cid].a_receber   += valor
    if (ag.status_pagamento === 'pago_clinica')                      map[cid].recebido    += valor
    if (isRepasseClinica && ag.status_pagamento === 'pendente')      map[cid].pendente_mp += valor

    if (isRepasseClinica && ag.status_pagamento === 'a_receber' && !ag.repasse_confirmado) {
      map[cid].repasse_pendente += valor
    }

    if (isComissaoClinica) {
      if (ag.comissao_clinica_confirmada) map[cid].comissao_paga     += comissaoValor
      else                                 map[cid].comissao_pendente += comissaoValor
    }

    map[cid].agendamentos.push({
      id:                          ag.id as number,
      tipo_exame:                  ag.tipo_exame,
      data_hora:                   ag.data_hora,
      valor:                       ag.valor,
      status_pagamento:            ag.status_pagamento,
      pet_nome:                    petNome,
      tutor_nome:                  tutNome,
      pagamento_responsavel:       ag.pagamento_responsavel as string | null,
      repasse_confirmado:          (ag.repasse_confirmado as boolean | null) ?? false,
      repasse_em:                  (ag.repasse_em as string | null) ?? null,
      comissao_clinica:            isComissaoClinica,
      comissao_valor:              comissaoValor,
      comissao_exame:              comissaoExameNome,
      comissao_clinica_confirmada: (ag.comissao_clinica_confirmada as boolean | null) ?? false,
      comissao_clinica_em:         (ag.comissao_clinica_em as string | null) ?? null,
    })
  }

  const clinicas = Object.values(map).sort((a, b) => b.total - a.total)

  return NextResponse.json({ clinicas })
}

import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { verifyLaudoApiKey } from '@/lib/laudo-api-auth'
import { agoraLocalISO } from '@/lib/agendamento-helpers'

interface PetRow {
  nome:            string
  especie:         string | null
  raca:            string | null
  sexo:            string | null
  pelagem:         string | null
  data_nascimento: string | null
  castrado:        boolean | null
  temperamento:    string | null
}

interface TutorRow {
  nome:     string | null
  telefone: string | null
}

interface VetRow {
  nome: string | null
}

interface AgendamentoRow {
  id:                       number
  data_hora:                string
  tipo_exame:               string | null
  laudo_dispensado:         boolean | null
  is_revisao:               boolean | null
  laudo_revisao_solicitado: boolean | null
  pets:                     PetRow | PetRow[] | null
  tutores:                  TutorRow | TutorRow[] | null
  veterinarios:             VetRow | VetRow[] | null
}

function single<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? v[0] ?? null : v
}

// GET /api/laudos/pendentes-ultrassom
// Lista exames de ultrassom já realizados (data_hora passada) que ainda não
// têm laudo emitido, com todos os dados de cabeçalho já resolvidos (paciente,
// tutor, veterinário) — para montar o laudo sem precisar perguntar ao usuário.
export async function GET(request: NextRequest) {
  if (!verifyLaudoApiKey(request)) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
  }

  const agoraISO = agoraLocalISO()

  // Candidatos: mesma regra usada em admin/dashboard/alertas e agente/laudo —
  // 'concluído' entra de propósito porque o status só vira isso quando TODOS
  // os laudos do agendamento já foram emitidos, então um agendamento com um
  // exame multi-tipo (ex.: Raio-X + Ultrassom) pode estar 'agendado' ainda.
  const { data: candidatos, error } = await supabase
    .from('agendamentos')
    .select(`
      id, data_hora, tipo_exame, laudo_dispensado, is_revisao, laudo_revisao_solicitado,
      pets(nome, especie, raca, sexo, pelagem, data_nascimento, castrado, temperamento),
      tutores(nome, telefone),
      veterinarios(nome)
    `)
    .in('status', ['agendado', 'concluído', 'em atendimento'])
    .lt('data_hora', agoraISO)
    .order('data_hora', { ascending: false })
    .returns<AgendamentoRow[]>()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const elegiveis = (candidatos ?? []).filter(ag => {
    if (ag.laudo_dispensado) return false
    if (ag.is_revisao && !ag.laudo_revisao_solicitado) return false
    return true
  })

  if (elegiveis.length === 0) return NextResponse.json([])

  const ids = elegiveis.map(ag => ag.id)

  // Granularidade real do exame: agendamento_exames (multi-exame); quando um
  // agendamento não tem linha lá (fluxo antigo de exame único), cai para
  // agendamentos.tipo_exame — mesmo fallback usado em laudos/gerar.
  const [{ data: exames }, { data: laudos }] = await Promise.all([
    supabase.from('agendamento_exames').select('agendamento_id, tipo_exame').in('agendamento_id', ids),
    supabase.from('laudos').select('agendamento_id, tipo_exame').in('agendamento_id', ids),
  ])

  const examesPorAgendamento = new Map<number, string[]>()
  for (const e of exames ?? []) {
    const lista = examesPorAgendamento.get(e.agendamento_id) ?? []
    lista.push(e.tipo_exame)
    examesPorAgendamento.set(e.agendamento_id, lista)
  }

  const laudosFeitos = new Set((laudos ?? []).map(l => `${l.agendamento_id}::${l.tipo_exame}`))

  const isUltrassom = (tipo: string) => tipo.toLowerCase().includes('ultrassom')

  const pendentes = elegiveis.flatMap(ag => {
    const tiposDoAgendamento = examesPorAgendamento.get(ag.id) ?? (ag.tipo_exame ? [ag.tipo_exame] : [])
    const pet = single(ag.pets)
    const tutor = single(ag.tutores)
    const vet = single(ag.veterinarios)

    return tiposDoAgendamento
      .filter(isUltrassom)
      .filter(tipo => !laudosFeitos.has(`${ag.id}::${tipo}`))
      .map(tipo => ({
        agendamento_id: ag.id,
        data_hora:      ag.data_hora,
        tipo_exame:     tipo,
        paciente: pet ? {
          nome:            pet.nome,
          especie:         pet.especie,
          raca:            pet.raca,
          sexo:            pet.sexo,
          pelagem:         pet.pelagem,
          data_nascimento: pet.data_nascimento,
          castrado:        pet.castrado,
          temperamento:    pet.temperamento,
        } : null,
        tutor: tutor ? {
          nome:     tutor.nome,
          telefone: tutor.telefone,
        } : null,
        veterinario: vet ? { nome: vet.nome } : null,
      }))
  })

  return NextResponse.json(pendentes)
}

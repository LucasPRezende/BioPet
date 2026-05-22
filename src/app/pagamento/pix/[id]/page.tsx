import { notFound } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import PIXPayment from './PIXPayment'

export default async function PIXPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const agId = Number(id)
  if (isNaN(agId)) notFound()

  const { data: ag } = await supabase
    .from('agendamentos')
    .select('id, tipo_exame, valor, data_hora, status_pagamento, pets(nome), agendamento_exames(tipo_exame, valor), tutores(cpf)')
    .eq('id', agId)
    .single()

  if (!ag) notFound()

  const petNome = Array.isArray(ag.pets)
    ? (ag.pets[0] as { nome: string })?.nome ?? '—'
    : (ag.pets as { nome: string } | null)?.nome ?? '—'

  const exames = ag.agendamento_exames as { tipo_exame: string; valor: number }[] | null
  const valor = exames && exames.length > 0
    ? exames.reduce((s, e) => s + Number(e.valor), 0)
    : Number(ag.valor) || 0

  const tutorRaw = ag.tutores as unknown
  const cpfTutor = (Array.isArray(tutorRaw)
    ? (tutorRaw[0] as { cpf: string | null })?.cpf
    : (tutorRaw as { cpf: string | null } | null)?.cpf) ?? ''

  return (
    <PIXPayment
      agendamentoId={agId}
      petNome={petNome}
      tipoExame={ag.tipo_exame}
      valor={valor}
      dataHora={ag.data_hora}
      statusInicial={ag.status_pagamento ?? ''}
      cpfInicial={cpfTutor}
    />
  )
}

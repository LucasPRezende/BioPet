import { notFound } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { isPixTokenValido } from '@/lib/pix-token'
import PIXPayment from './PIXPayment'

export default async function PIXPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  // Valida formato do token antes de consultar o banco
  if (!isPixTokenValido(token)) notFound()

  const { data: ag } = await supabase
    .from('agendamentos')
    .select('id, tipo_exame, valor, data_hora, status_pagamento, forma_pagamento, entrega_pagamento, pets(nome), agendamento_exames(tipo_exame, valor), tutores(cpf, nome)')
    .eq('pix_token', token)
    .single()

  if (!ag) notFound()

  // Só exibe se for pagamento PIX por link
  const forma    = (ag.forma_pagamento ?? '').toLowerCase()
  const entrega  = (ag.entrega_pagamento ?? '').toLowerCase()
  if (!forma.includes('pix') || entrega !== 'link') notFound()

  const petNome = Array.isArray(ag.pets)
    ? (ag.pets[0] as { nome: string })?.nome ?? '—'
    : (ag.pets as { nome: string } | null)?.nome ?? '—'

  const tutorRaw = ag.tutores as unknown
  const cpfTutor = (Array.isArray(tutorRaw)
    ? (tutorRaw[0] as { cpf: string | null })?.cpf
    : (tutorRaw as { cpf: string | null } | null)?.cpf) ?? ''

  const exames = ag.agendamento_exames as { tipo_exame: string; valor: number }[] | null
  const valor  = exames && exames.length > 0
    ? exames.reduce((s, e) => s + Number(e.valor), 0)
    : Number(ag.valor) || 0

  return (
    <PIXPayment
      agendamentoId={ag.id}
      pixToken={token}
      petNome={petNome}
      tipoExame={ag.tipo_exame}
      valor={valor}
      dataHora={ag.data_hora}
      statusInicial={ag.status_pagamento ?? ''}
      cpfInicial={cpfTutor}
    />
  )
}

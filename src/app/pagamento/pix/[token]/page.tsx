import { notFound } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { isPixTokenValido } from '@/lib/pix-token'
import { pixLinkExpirado } from '@/lib/agendamento-helpers'
import PIXPayment from './PIXPayment'
import PagamentoConfirmado from './PagamentoConfirmado'

// Só o suficiente pro tutor reconhecer o próprio CPF: 123.456.789-01 → ***.456.789-**
// O número completo nunca vai pro HTML — o backend usa o que está no banco.
function mascararCPF(cpf: string): string {
  const d = cpf.replace(/\D/g, '')
  if (d.length !== 11) return ''
  return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`
}

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

  // Já pago: não existe mais nada a fazer aqui. Nos primeiros 7 dias depois do
  // exame o link ainda abre um recibo sem dado pessoal — nada de CPF, pet,
  // exame ou valor; passado isso ele simplesmente some.
  // Link EM ABERTO não expira: a cobrança pode ser feita retroativamente.
  if (ag.status_pagamento === 'pago') {
    if (pixLinkExpirado(ag.data_hora)) notFound()
    return <PagamentoConfirmado />
  }

  const petNome = Array.isArray(ag.pets)
    ? (ag.pets[0] as { nome: string })?.nome ?? '—'
    : (ag.pets as { nome: string } | null)?.nome ?? '—'

  const tutorRaw = ag.tutores as unknown
  const cpfTutor = (Array.isArray(tutorRaw)
    ? (tutorRaw[0] as { cpf: string | null })?.cpf
    : (tutorRaw as { cpf: string | null } | null)?.cpf) ?? ''

  const exames    = ag.agendamento_exames as { tipo_exame: string; valor: number }[] | null
  const agValor   = Number(ag.valor) || 0
  const examesSum = exames && exames.length > 0 ? exames.reduce((s, e) => s + Number(e.valor), 0) : 0
  // Usa soma dos exames apenas se bater com o total — protege contra agendamento_exames stale após edição
  const valor = exames && exames.length > 0 && Math.abs(examesSum - agValor) < 0.01
    ? examesSum
    : agValor

  return (
    <PIXPayment
      agendamentoId={ag.id}
      pixToken={token}
      petNome={petNome}
      tipoExame={ag.tipo_exame}
      valor={valor}
      dataHora={ag.data_hora}
      statusInicial={ag.status_pagamento ?? ''}
      cpfMascarado={mascararCPF(cpfTutor)}
    />
  )
}

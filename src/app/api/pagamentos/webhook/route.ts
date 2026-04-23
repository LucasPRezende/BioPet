import { NextRequest, NextResponse } from 'next/server'
import { MercadoPagoConfig, Payment } from 'mercadopago'
import { supabase } from '@/lib/supabase'

const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN! })

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)

  // Responde 200 imediatamente — MP pode retentar se demorar
  const response = NextResponse.json({ ok: true })

  try {
    if (body?.type === 'payment' && body?.data?.id) {
      const payment = await new Payment(client).get({ id: String(body.data.id) })

      if (payment.status === 'approved' && payment.external_reference) {
        const agendamentoId = Number(
          payment.external_reference.replace('biopet-agendamento-', '')
        )
        if (!isNaN(agendamentoId)) {
          // Busca nome do tutor para a notificação
          const { data: ag } = await supabase
            .from('agendamentos')
            .select('tutores(nome)')
            .eq('id', agendamentoId)
            .single()

          const nomeTutor =
            (Array.isArray(ag?.tutores)
              ? ag.tutores[0]?.nome
              : (ag?.tutores as { nome: string } | null)?.nome) ?? null

          await supabase
            .from('agendamentos')
            .update({
              status_pagamento: 'pago',
              mp_payment_id:    String(payment.id),
              pago_em:          new Date().toISOString(),
            })
            .eq('id', agendamentoId)

          await supabase.from('notificacoes').insert({
            tipo_evento:      'pagamento_confirmado',
            agendamento_id:   agendamentoId,
            nome_tutor:       nomeTutor,
            mensagem_cliente: 'Pagamento confirmado via Mercado Pago',
            visualizado:      false,
            motivo:           'pagamento_confirmado',
            telefone:         '',
          })
        }
      }
    }
  } catch {
    // Silencia erros — já respondemos 200
  }

  return response
}

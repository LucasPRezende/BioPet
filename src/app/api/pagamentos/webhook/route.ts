import { NextRequest, NextResponse } from 'next/server'
import { MercadoPagoConfig, Payment } from 'mercadopago'
import { supabase } from '@/lib/supabase'

const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN! })

async function verifySignature(request: NextRequest, rawBody: string): Promise<boolean> {
  const secret = process.env.MP_WEBHOOK_SECRET
  if (!secret) {
    console.error('[webhook/mp] MP_WEBHOOK_SECRET não configurado — rejeitando todas as requisições.')
    return false
  }

  const xSignature  = request.headers.get('x-signature')   ?? ''
  const xRequestId  = request.headers.get('x-request-id')  ?? ''
  const dataId      = new URL(request.url).searchParams.get('data.id') ?? ''

  // formato: "ts=<ts>,v1=<hmac>"
  const parts = Object.fromEntries(xSignature.split(',').map(p => p.split('=')))
  const ts    = parts['ts']
  const v1    = parts['v1']
  if (!ts || !v1) return false

  const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`
  const keyBytes  = new TextEncoder().encode(secret)
  const msgBytes  = new TextEncoder().encode(manifest)

  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig  = await crypto.subtle.sign('HMAC', key, msgBytes)
  const hex  = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('')

  return hex === v1
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text()
  let body: Record<string, unknown> | null = null
  try { body = JSON.parse(rawBody) } catch { /* ignorado */ }

  const valid = await verifySignature(request, rawBody)
  if (!valid) {
    console.warn('[webhook/mp] assinatura inválida — requisição rejeitada')
    return NextResponse.json({ error: 'Assinatura inválida.' }, { status: 401 })
  }

  // Responde 200 imediatamente — MP pode retentar se demorar
  const response = NextResponse.json({ ok: true })

  try {
    if (body?.type === 'payment' && body?.data && typeof body.data === 'object') {
      const dataId = (body.data as Record<string, unknown>).id
      if (!dataId) return response

      const payment = await new Payment(client).get({ id: String(dataId) })

      if (payment.status === 'approved' && payment.external_reference) {
        const agendamentoId = Number(
          payment.external_reference.replace('biopet-agendamento-', '')
        )
        if (isNaN(agendamentoId)) return response

        // Idempotência: ignora se payment_id já foi registrado
        const { data: existing } = await supabase
          .from('agendamentos')
          .select('mp_payment_id')
          .eq('id', agendamentoId)
          .single()

        if (existing?.mp_payment_id) {
          console.info(`[webhook/mp] pagamento ${payment.id} já processado para agendamento ${agendamentoId}`)
          return response
        }

        // Busca nome do tutor para a notificação
        const { data: ag } = await supabase
          .from('agendamentos')
          .select('tutores(nome)')
          .eq('id', agendamentoId)
          .single()

        const tutoresRaw = ag?.tutores as unknown
        const nomeTutor =
          (Array.isArray(tutoresRaw)
            ? (tutoresRaw[0] as { nome: string } | null)?.nome
            : (tutoresRaw as { nome: string } | null)?.nome) ?? null

        const { error: updateError } = await supabase
          .from('agendamentos')
          .update({
            status_pagamento: 'pago',
            mp_payment_id:    String(payment.id),
            pago_em:          new Date().toISOString(),
          })
          .eq('id', agendamentoId)

        if (updateError) {
          console.error(`[webhook/mp] erro ao atualizar agendamento ${agendamentoId}:`, updateError.message)
        }

        const { error: notifError } = await supabase.from('notificacoes').insert({
          tipo_evento:      'pagamento_confirmado',
          agendamento_id:   agendamentoId,
          nome_tutor:       nomeTutor,
          mensagem_cliente: 'Pagamento confirmado via Mercado Pago',
          visualizado:      false,
          motivo:           'pagamento_confirmado',
          telefone:         '',
        })

        if (notifError) {
          console.error(`[webhook/mp] erro ao inserir notificação:`, notifError.message)
        }
      }
    }
  } catch (err) {
    console.error('[webhook/mp] erro inesperado:', err)
  }

  return response
}

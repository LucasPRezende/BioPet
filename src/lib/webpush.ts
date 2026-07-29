/**
 * Notificações push no navegador para usuários do sistema (PC/Android).
 * Complementa o WhatsApp: dispara para quem ativou notificações no painel.
 */
import webpush from 'web-push'
import { supabase } from '@/lib/supabase'

let configurado = false

function configurar(): boolean {
  if (configurado) return true
  const publicKey  = process.env.VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject    = process.env.VAPID_SUBJECT
  if (!publicKey || !privateKey || !subject) {
    console.warn('[WebPush] VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY/VAPID_SUBJECT não configurados.')
    return false
  }
  webpush.setVapidDetails(subject, publicKey, privateKey)
  configurado = true
  return true
}

export interface PushPayload {
  title: string
  body: string
  url?: string
}

/** Manda a notificação push para todo usuário do sistema que ativou no navegador. */
export async function sendPushToAdmins(payload: PushPayload): Promise<void> {
  if (!configurar()) return

  const { data: subs, error } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')

  if (error) {
    console.error('[WebPush] falha ao buscar subscriptions:', error.message)
    return
  }
  if (!subs || subs.length === 0) return

  const body = JSON.stringify(payload)

  await Promise.all(subs.map(async (sub) => {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        body,
      )
    } catch (err: any) {
      // 404/410 = subscription expirada ou revogada pelo navegador — remove.
      if (err?.statusCode === 404 || err?.statusCode === 410) {
        await supabase.from('push_subscriptions').delete().eq('id', sub.id)
      } else {
        console.error('[WebPush] falha ao enviar:', err?.statusCode, err?.body ?? err)
      }
    }
  }))
}

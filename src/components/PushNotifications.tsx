'use client'

import { useEffect, useState } from 'react'

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const bytes = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes
}

async function subscribe(): Promise<boolean> {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  if (!publicKey) return false

  const registration = await navigator.serviceWorker.register('/sw.js')
  const existing = await registration.pushManager.getSubscription()
  const subscription = existing ?? await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
  })

  const res = await fetch('/api/admin/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscription }),
  })
  return res.ok
}

// Banner discreto pedindo permissão de notificação no navegador. Some sozinho
// depois de ativado/recusado. Se a permissão já tiver sido concedida antes
// (outra sessão), reinscreve em silêncio, sem mostrar nada.
export default function PushNotifications() {
  const [status, setStatus] = useState<'idle' | 'ask' | 'loading' | 'done'>('idle')

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return

    if (Notification.permission === 'granted') {
      subscribe().catch(() => {})
    } else if (Notification.permission === 'default') {
      setStatus('ask')
    }
  }, [])

  async function ativar() {
    setStatus('loading')
    try {
      const permission = await Notification.requestPermission()
      if (permission === 'granted') await subscribe()
    } finally {
      setStatus('done')
    }
  }

  if (status !== 'ask') return null

  return (
    <div className="flex items-center justify-between gap-3 bg-amber-50 border-b border-amber-200 px-4 py-2 text-sm text-amber-900">
      <span>🔔 Ativar notificações do navegador para não perder avisos do sistema?</span>
      <div className="flex items-center gap-2 shrink-0">
        <button onClick={ativar} className="px-3 py-1 rounded bg-amber-600 text-white hover:bg-amber-700 transition">
          Ativar
        </button>
        <button onClick={() => setStatus('done')} className="px-3 py-1 rounded text-amber-800 hover:bg-amber-100 transition">
          Agora não
        </button>
      </div>
    </div>
  )
}

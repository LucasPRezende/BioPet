'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import Script from 'next/script'

type Estado = 'form' | 'gerando' | 'aguardando' | 'pago' | 'erro'

interface Props {
  agendamentoId: number
  petNome:       string
  tipoExame:     string
  valor:         number
  dataHora:      string
  statusInicial: string
  cpfInicial?:   string
}

function formatDataHora(iso: string) {
  const [datePart, timePart = '00:00'] = iso.split('T')
  const [year, month, day] = datePart.split('-').map(Number)
  const [hour, minute]     = timePart.split(':').map(Number)
  const d    = new Date(year, month - 1, day)
  const dias = ['domingo','segunda','terça','quarta','quinta','sexta','sábado']
  const dd   = String(day).padStart(2, '0')
  const mm   = String(month).padStart(2, '0')
  const hh   = String(hour).padStart(2, '0')
  const min  = minute > 0 ? `:${String(minute).padStart(2, '0')}` : ''
  return `${dias[d.getDay()]}, ${dd}/${mm} às ${hh}h${min}`
}

function brl(n: number) {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatCPFInput(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 3) return d
  if (d.length <= 6) return `${d.slice(0,3)}.${d.slice(3)}`
  if (d.length <= 9) return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6)}`
  return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`
}

export default function PIXPayment({ agendamentoId, petNome, tipoExame, valor, dataHora, statusInicial, cpfInicial }: Props) {
  const [estado,       setEstado]      = useState<Estado>(statusInicial === 'pago' ? 'pago' : 'form')
  const [cpf,          setCpf]         = useState(cpfInicial ? formatCPFInput(cpfInicial) : '')
  const [deviceId,     setDeviceId]    = useState('')
  const [erro,         setErro]        = useState('')
  const [qrCode,       setQrCode]      = useState('')
  const [qrBase64,     setQrBase64]    = useState('')
  const [copiado,      setCopiado]     = useState(false)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (estado === 'aguardando') {
      pollingRef.current = setInterval(async () => {
        const res  = await fetch(`/api/pagamentos/status/${agendamentoId}`)
        const data = await res.json()
        if (data.pago === true) {
          clearInterval(pollingRef.current!)
          setEstado('pago')
        }
      }, 5000)
    }
    return () => { if (pollingRef.current) clearInterval(pollingRef.current) }
  }, [estado, agendamentoId])

  function validarCPF(cpf: string): boolean {
    const c = cpf.replace(/\D/g, '')
    if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false
    const calc = (n: number) => {
      let s = 0
      for (let i = 0; i < n; i++) s += parseInt(c[i]) * (n + 1 - i)
      const r = (s * 10) % 11
      return r === 10 || r === 11 ? 0 : r
    }
    return calc(9) === parseInt(c[9]) && calc(10) === parseInt(c[10])
  }

  async function gerarPix() {
    const cpfClean = cpf.replace(/\D/g, '')
    if (cpfClean.length !== 11) { setErro('Digite um CPF válido com 11 dígitos.'); return }
    if (!validarCPF(cpf)) { setErro('CPF inválido — verifique os dígitos.'); return }
    setErro('')
    setEstado('gerando')

    const res  = await fetch('/api/pagamentos/criar-pix', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agendamento_id: agendamentoId, cpf: cpfClean, device_id: deviceId }),
    })
    const data = await res.json()

    if (!res.ok || data.error) {
      setErro(data.error ?? 'Erro ao gerar PIX. Tente novamente.')
      setEstado('form')
      return
    }

    setQrCode(data.qr_code)
    setQrBase64(data.qr_code_base64)
    setEstado('aguardando')
  }

  function copiar() {
    navigator.clipboard.writeText(qrCode).then(() => {
      setCopiado(true)
      setTimeout(() => setCopiado(false), 3000)
    })
  }

  return (
    <>
    {/* SDK MercadoPago.JS V2 — requisito de qualidade da integração */}
    <Script
      src="https://sdk.mercadopago.com/js/v2"
      strategy="afterInteractive"
      onLoad={() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const w = window as any
        if (w.MercadoPago) {
          new w.MercadoPago(process.env.NEXT_PUBLIC_MP_PUBLIC_KEY ?? '')
          // Device fingerprint — enviado ao backend para vincular sessão ao pagamento
          setTimeout(() => setDeviceId(w.MP_DEVICE_SESSION_ID ?? ''), 500)
        }
      }}
    />
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-8">
      <div className="bg-white rounded-2xl shadow-sm border max-w-sm w-full p-6 space-y-5">

        {/* Header */}
        <div className="flex items-center gap-3 pb-4 border-b border-gray-100">
          <div className="relative w-10 h-10 flex-shrink-0">
            <Image src="/logo.png" alt="BioPet" fill className="object-contain" />
          </div>
          <div>
            <p className="font-bold text-[#19202d] text-sm">BioPet Vet</p>
            <p className="text-xs text-gray-400">Pagamento PIX</p>
          </div>
        </div>

        {/* Resumo do agendamento */}
        <div className="bg-gray-50 rounded-xl p-4 space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">Pet</span>
            <span className="font-medium text-[#19202d]">{petNome}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Exame</span>
            <span className="font-medium text-[#19202d] text-right max-w-[55%]">{tipoExame}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Data</span>
            <span className="font-medium text-[#19202d]">{formatDataHora(dataHora)}</span>
          </div>
          <div className="flex justify-between pt-2 border-t border-gray-200 mt-2">
            <span className="text-gray-500 font-semibold">Total</span>
            <span className="font-bold text-[#19202d] text-base">{brl(valor)}</span>
          </div>
        </div>

        {/* Estado: formulário CPF */}
        {estado === 'form' && (
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium text-[#19202d] mb-1">Seu CPF</p>
              <p className="text-xs text-gray-400 mb-3">Necessário para emissão do PIX</p>
              <input
                type="text"
                inputMode="numeric"
                placeholder="000.000.000-00"
                value={cpf}
                onChange={e => setCpf(formatCPFInput(e.target.value))}
                className="w-full border border-gray-200 rounded-lg px-4 py-3 text-[#19202d] text-base focus:outline-none focus:ring-2 focus:ring-[#c4a35a]"
              />
              {erro && <p className="text-red-500 text-xs mt-1">{erro}</p>}
            </div>
            <button
              onClick={gerarPix}
              className="w-full bg-[#19202d] hover:bg-[#2a3447] text-white font-bold py-3 rounded-xl transition text-sm"
            >
              Gerar PIX
            </button>
          </div>
        )}

        {/* Estado: gerando */}
        {estado === 'gerando' && (
          <div className="text-center py-6 space-y-3">
            <div className="text-3xl animate-spin inline-block">⏳</div>
            <p className="text-sm text-gray-500">Gerando seu PIX...</p>
          </div>
        )}

        {/* Estado: aguardando pagamento */}
        {estado === 'aguardando' && (
          <div className="space-y-4">
            <div className="text-center">
              <span className="inline-block bg-yellow-50 text-yellow-700 text-xs font-semibold px-3 py-1 rounded-full border border-yellow-200">
                Aguardando pagamento
              </span>
            </div>

            {qrBase64 && (
              <div className="flex justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`data:image/png;base64,${qrBase64}`}
                  alt="QR Code PIX"
                  className="w-52 h-52 rounded-lg border border-gray-100"
                />
              </div>
            )}

            <div>
              <p className="text-xs text-gray-500 mb-2 text-center">Ou copie o código PIX:</p>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs text-gray-600 break-all font-mono select-all">
                {qrCode.slice(0, 60)}…
              </div>
              <button
                onClick={copiar}
                className="mt-2 w-full border border-[#19202d] text-[#19202d] font-semibold py-2.5 rounded-xl text-sm hover:bg-gray-50 transition"
              >
                {copiado ? '✅ Copiado!' : '📋 Copiar código PIX'}
              </button>
            </div>

            <p className="text-xs text-gray-400 text-center">
              Abra o app do seu banco, vá em PIX e escaneie o QR code ou cole o código.
            </p>
          </div>
        )}

        {/* Estado: pago */}
        {estado === 'pago' && (
          <div className="text-center space-y-3 py-4">
            <div className="text-5xl">✅</div>
            <p className="font-bold text-[#19202d]">Pagamento confirmado!</p>
            <p className="text-sm text-gray-500">Seu agendamento está garantido. Você receberá a confirmação no WhatsApp.</p>
          </div>
        )}

        <p className="text-xs text-gray-300 text-center pt-2 border-t border-gray-50">
          Powered by Mercado Pago
        </p>
      </div>
    </div>
    </>
  )
}

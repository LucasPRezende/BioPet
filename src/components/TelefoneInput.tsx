'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Campo de telefone com seletor de DDI (código do país), estilo Telegram.
 * Brasil (+55) é o padrão; o valor emitido sempre sai no formato "+DDI<dígitos>"
 * para o backend saber que o código do país é explícito.
 */

const PAISES = [
  { ddi: '55',  label: '🇧🇷 +55' },
  { ddi: '54',  label: '🇦🇷 +54' },
  { ddi: '598', label: '🇺🇾 +598' },
  { ddi: '595', label: '🇵🇾 +595' },
  { ddi: '56',  label: '🇨🇱 +56' },
  { ddi: '591', label: '🇧🇴 +591' },
  { ddi: '51',  label: '🇵🇪 +51' },
  { ddi: '1',   label: '🇺🇸 +1' },
  { ddi: '351', label: '🇵🇹 +351' },
  { ddi: '34',  label: '🇪🇸 +34' },
]

const POR_TAMANHO = [...PAISES].sort((a, b) => b.ddi.length - a.ddi.length)

function parse(value: string | null | undefined): { ddi: string; local: string } {
  const str = String(value ?? '').trim()
  const ddiExplicito = str.startsWith('+')
  const digits = str.replace(/\D/g, '')
  if (!digits) return { ddi: '55', local: '' }
  // Sem "+", só consideramos DDI embutido quando o número é longo demais para
  // ser local BR (> 11 dígitos) — evita confundir DDDs como 11/51/54 com DDIs.
  if (ddiExplicito || digits.length > 11) {
    if (digits.startsWith('55') && digits.length >= 12) return { ddi: '55', local: digits.slice(2) }
    for (const p of POR_TAMANHO) {
      if (digits.startsWith(p.ddi) && digits.length > p.ddi.length) {
        return { ddi: p.ddi, local: digits.slice(p.ddi.length) }
      }
    }
  }
  return { ddi: '55', local: digits }
}

interface Props {
  value:        string
  onChange:     (value: string) => void
  inputClass?:  string
  placeholder?: string
  required?:    boolean
  readOnly?:    boolean
  autoFocus?:   boolean
}

export default function TelefoneInput({
  value,
  onChange,
  inputClass = '',
  placeholder = '(24) 99999-9999',
  required,
  readOnly,
  autoFocus,
}: Props) {
  const inicial = parse(value)
  const [ddi,   setDdi]   = useState(inicial.ddi)
  const [local, setLocal] = useState(inicial.local)
  const ultimoEmitido = useRef(value)

  // Sincroniza quando o valor muda por fora (ex.: seleção de tutor existente).
  useEffect(() => {
    if (value === ultimoEmitido.current) return
    const p = parse(value)
    setDdi(p.ddi)
    setLocal(p.local)
    ultimoEmitido.current = value
  }, [value])

  function emitir(novoDdi: string, novoLocal: string) {
    const digits = novoLocal.replace(/\D/g, '')
    const v = digits ? `+${novoDdi}${digits}` : ''
    ultimoEmitido.current = v
    onChange(v)
  }

  function handleLocal(raw: string) {
    // Colou o número completo com "+DDI"? Reparte entre os dois campos.
    if (raw.trim().startsWith('+')) {
      const p = parse(raw)
      setDdi(p.ddi)
      setLocal(p.local)
      emitir(p.ddi, p.local)
      return
    }
    setLocal(raw)
    emitir(ddi, raw)
  }

  return (
    <div className="flex gap-2">
      <select
        value={ddi}
        disabled={readOnly}
        onChange={e => { setDdi(e.target.value); emitir(e.target.value, local) }}
        style={{ width: 104, flexShrink: 0 }}
        className={`${inputClass} px-2`}
        aria-label="Código do país"
      >
        {PAISES.map(p => <option key={p.ddi} value={p.ddi}>{p.label}</option>)}
      </select>
      <input
        type="tel"
        value={local}
        onChange={e => handleLocal(e.target.value)}
        placeholder={placeholder}
        required={required}
        readOnly={readOnly}
        autoFocus={autoFocus}
        className={`${inputClass} min-w-0 flex-1`}
      />
    </div>
  )
}

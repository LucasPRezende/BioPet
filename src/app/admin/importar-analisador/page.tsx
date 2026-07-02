'use client'

import { useState, useRef, useCallback, DragEvent } from 'react'

export default function ImportarAnalisadorPage() {
  const [file,     setFile]     = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const [done,     setDone]     = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = useCallback((f: File) => {
    if (!f.name.toLowerCase().endsWith('.pdf')) {
      setError('Selecione um arquivo PDF.')
      return
    }
    setFile(f)
    setError('')
    setDone(false)
  }, [])

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) handleFile(f)
  }

  async function converter() {
    if (!file) return
    setLoading(true)
    setError('')
    setDone(false)

    try {
      const form = new FormData()
      form.append('pdf', file)

      const res = await fetch('/api/laudos/importar-analisador', { method: 'POST', body: form })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error ?? 'Erro ao converter o PDF.')
        return
      }

      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = file.name.replace(/\.pdf$/i, '_biopet.pdf')
      a.click()
      URL.revokeObjectURL(url)
      setDone(true)
    } catch {
      setError('Erro de conexão. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-lg mx-auto">

        {/* Header */}
        <div className="mb-6">
          <a href="/admin/laudos" className="text-xs text-gray-400 hover:text-gray-600 mb-3 inline-block">
            ← Voltar para laudos
          </a>
          <h1 className="text-xl font-bold text-[#19202d]">Converter PDF do Analisador</h1>
          <p className="text-sm text-gray-500 mt-1">
            Importe o PDF gerado pelo aparelho de gasometria e receba um laudo com a identidade visual da BioPet.
          </p>
        </div>

        {/* Upload card */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="h-1 bg-[#C9A96A]" />
          <div className="p-6 space-y-4">

            {/* Drop zone */}
            <div
              onDragOver={e => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => inputRef.current?.click()}
              className={`cursor-pointer rounded-lg border-2 border-dashed transition-colors p-8 flex flex-col items-center gap-3
                ${dragging
                  ? 'border-[#3BA7B0] bg-[#CFE7E9]/30'
                  : file
                    ? 'border-[#C9A96A] bg-amber-50/40'
                    : 'border-gray-200 hover:border-gray-300 bg-gray-50/50'}`}
            >
              <input
                ref={inputRef}
                type="file"
                accept=".pdf,application/pdf"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
              />

              {file ? (
                <>
                  <svg className="w-8 h-8 text-[#C9A96A]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <p className="text-sm font-semibold text-[#19202d] text-center">{file.name}</p>
                  <p className="text-xs text-gray-400">Clique para trocar o arquivo</p>
                </>
              ) : (
                <>
                  <svg className="w-8 h-8 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                      d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <p className="text-sm text-gray-500 text-center">
                    Arraste o PDF aqui ou <span className="text-[#8a6e36] font-medium">clique para selecionar</span>
                  </p>
                  <p className="text-xs text-gray-400">PDF gerado pelo analisador de gasometria</p>
                </>
              )}
            </div>

            {/* Error */}
            {error && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            {/* Success */}
            {done && (
              <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                PDF convertido e baixado com sucesso.
              </p>
            )}

            {/* Button */}
            <button
              onClick={converter}
              disabled={!file || loading}
              className="w-full bg-[#19202d] hover:bg-[#232d3f] text-white font-semibold text-sm py-2.5 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Convertendo...
                </>
              ) : (
                'Converter e Baixar PDF'
              )}
            </button>

          </div>
        </div>

        <p className="text-xs text-gray-400 mt-4 text-center">
          O PDF convertido não é salvo no sistema. Para vincular a um paciente, use{' '}
          <a href="/admin/novo-bioquimica" className="underline hover:text-gray-600">Novo Laudo Bioquímica</a>.
        </p>

      </div>
    </div>
  )
}

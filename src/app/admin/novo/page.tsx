'use client'

import { useState, useRef } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import Image from 'next/image'

// Carregado apenas no cliente (Tiptap usa APIs de DOM)
const RichTextEditor = dynamic(() => import('@/components/RichTextEditor'), { ssr: false })

const ESPECIES = ['Cachorro', 'Gato', 'Pássaro', 'Coelho', 'Hamster', 'Réptil', 'Outro']
const SEXOS    = ['Macho', 'Fêmea', 'Não informado']

interface SuccessData {
  link: string
  tutor: string
  telefone: string
  nomePet: string
}

function buildWhatsAppLink(telefone: string, url: string, nomePet: string) {
  const digits = telefone.replace(/\D/g, '')
  const number = digits.startsWith('55') && digits.length >= 12 ? digits : `55${digits}`
  const msg = encodeURIComponent(
    `Olá! O laudo do *${nomePet}* já está disponível. Acesse pelo link abaixo:\n${url}`
  )
  return `https://wa.me/${number}?text=${msg}`
}

const INPUT = 'w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#8a6e36] focus:border-transparent bg-white'

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
        {label} {required && <span className="text-red-400 normal-case font-normal">*</span>}
      </label>
      {children}
    </div>
  )
}

export default function NovoLaudoPage() {
  const pdfInputRef = useRef<HTMLInputElement>(null)
  const imgInputRef = useRef<HTMLInputElement>(null)

  const [modo, setModo] = useState<'upload' | 'gerar'>('upload')
  const [form, setForm] = useState({
    nome_pet: '', especie: '', tutor: '', telefone: '',
    sexo: '', raca: '', medico_responsavel: 'Luciana Pereira de Brites',
    idade: '', data_laudo: new Date().toISOString().split('T')[0],
  })
  const [texto, setTexto]     = useState('')
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [imagens, setImagens] = useState<File[]>([])
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState<SuccessData | null>(null)

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  function handlePdfChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    if (f.type !== 'application/pdf') { setError('Selecione um arquivo PDF.'); return }
    setPdfFile(f)
    setError('')
  }

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    setImagens(prev => [...prev, ...Array.from(e.target.files ?? [])])
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (modo === 'upload' && !pdfFile) { setError('Selecione um arquivo PDF.'); return }
    if (modo === 'gerar' && !texto.trim()) { setError('O texto do laudo é obrigatório.'); return }

    setLoading(true)

    const data = new FormData()
    data.append('nome_pet',  form.nome_pet)
    data.append('especie',   form.especie)
    data.append('tutor',     form.tutor)
    data.append('telefone',  form.telefone)

    let endpoint = '/api/laudos'

    if (modo === 'upload') {
      data.append('pdf', pdfFile!)
    } else {
      endpoint = '/api/laudos/gerar'
      data.append('sexo',               form.sexo)
      data.append('raca',               form.raca)
      data.append('medico_responsavel', form.medico_responsavel)
      data.append('idade',              form.idade)
      data.append('data_laudo',         form.data_laudo)
      data.append('texto',              texto)
      for (const img of imagens) data.append('imagens', img)
    }

    const res = await fetch(endpoint, { method: 'POST', body: data })

    if (res.ok) {
      const laudo = await res.json()
      setSuccess({
        link:     `${window.location.origin}/laudo/${laudo.token}`,
        tutor:    form.tutor,
        telefone: form.telefone,
        nomePet:  form.nome_pet,
      })
    } else {
      let msg = 'Erro ao cadastrar laudo.'
      try {
        const err = await res.json()
        msg = err.error ?? msg
      } catch {
        msg = `Erro do servidor (${res.status}). Verifique os logs.`
      }
      setError(msg)
    }

    setLoading(false)
  }

  // ── Tela de sucesso ────────────────────────────────────────────────────────
  if (success) {
    const waLink = buildWhatsAppLink(success.telefone, success.link, success.nomePet)
    return (
      <div className="min-h-screen bg-[#19202d] flex items-center justify-center px-4">
        <div className="h-1 bg-gold-stripe absolute top-0 left-0 right-0" />
        <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-lg text-center">
          <div className="text-5xl mb-3">✅</div>
          <h2 className="text-2xl font-bold text-[#19202d] mb-1">Laudo cadastrado!</h2>
          <p className="text-gray-400 text-sm mb-6">{success.tutor} · {success.telefone}</p>

          <div className="bg-amber-50 border border-[#8a6e36]/30 rounded-xl p-4 mb-6 text-left">
            <p className="text-xs font-bold text-[#8a6e36] uppercase mb-1">Link do laudo</p>
            <p className="text-[#19202d] text-sm font-mono break-all">{success.link}</p>
          </div>

          <a href={waLink} target="_blank" rel="noreferrer"
            className="flex items-center justify-center gap-2 w-full bg-green-500 hover:bg-green-600 text-white font-bold py-3 rounded-xl transition mb-3">
            <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current" xmlns="http://www.w3.org/2000/svg">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
            Enviar pelo WhatsApp
          </a>

          <div className="flex gap-3">
            <button onClick={() => navigator.clipboard.writeText(success.link)}
              className="flex-1 bg-amber-50 hover:bg-amber-100 text-[#8a6e36] border border-[#8a6e36]/30 font-semibold px-4 py-2.5 rounded-lg transition text-sm">
              Copiar link
            </button>
            <Link href="/admin/dashboard"
              className="flex-1 border border-gray-200 hover:bg-gray-50 text-gray-500 px-4 py-2.5 rounded-lg transition text-sm text-center">
              Ver lista
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // ── Formulário ─────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-[#19202d] text-white shadow-lg">
        <div className="h-1 bg-gold-stripe" />
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-3">
          <div className="relative w-12 h-12 shrink-0">
            <Image src="/logo.png" alt="BioPet" fill className="object-contain" />
          </div>
          <Link href="/admin/dashboard" className="text-gray-400 hover:text-white transition text-sm">
            ← Voltar
          </Link>
          <h1 className="text-lg font-bold">Novo Laudo</h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-5">
        {/* Toggle */}
        <div className="bg-white rounded-xl border overflow-hidden shadow-sm">
          <div className="h-1 bg-gold-stripe" />
          <div className="p-3 flex gap-1">
            <button type="button" onClick={() => setModo('upload')}
              className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition flex items-center justify-center gap-2 ${
                modo === 'upload' ? 'bg-[#19202d] text-white shadow' : 'text-gray-400 hover:bg-gray-50'
              }`}>
              📎 Upload de PDF
            </button>
            <button type="button" onClick={() => setModo('gerar')}
              className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition flex items-center justify-center gap-2 ${
                modo === 'gerar' ? 'bg-[#19202d] text-white shadow' : 'text-gray-400 hover:bg-gray-50'
              }`}>
              ✍️ Preencher Laudo
            </button>
          </div>
          <p className="text-center text-xs text-gray-400 pb-3 px-4">
            {modo === 'upload'
              ? 'Anexe um PDF já pronto para compartilhar com o tutor.'
              : 'Preencha o laudo e gere o PDF automaticamente com a identidade BioPet.'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Dados do Paciente */}
          <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
            <div className="h-1 bg-gold-stripe" />
            <div className="p-6">
              <h3 className="text-xs font-bold text-[#19202d] uppercase tracking-widest mb-4">
                Dados do Paciente
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Nome do Animal" required>
                  <input type="text" name="nome_pet" value={form.nome_pet} onChange={handleChange}
                    placeholder="Ex: Rex, Mimi..." required className={INPUT} />
                </Field>
                <Field label="Espécie" required>
                  <select name="especie" value={form.especie} onChange={handleChange} required className={INPUT}>
                    <option value="">Selecione...</option>
                    {ESPECIES.map(e => <option key={e}>{e}</option>)}
                  </select>
                </Field>
                <Field label="Proprietário" required>
                  <input type="text" name="tutor" value={form.tutor} onChange={handleChange}
                    placeholder="Nome completo" required className={INPUT} />
                </Field>
                <Field label="Telefone" required>
                  <input type="tel" name="telefone" value={form.telefone} onChange={handleChange}
                    placeholder="(11) 99999-9999" required className={INPUT} />
                </Field>

                {modo === 'gerar' && (
                  <>
                    <Field label="Sexo">
                      <select name="sexo" value={form.sexo} onChange={handleChange} className={INPUT}>
                        <option value="">Selecione...</option>
                        {SEXOS.map(s => <option key={s}>{s}</option>)}
                      </select>
                    </Field>
                    <Field label="Raça">
                      <input type="text" name="raca" value={form.raca} onChange={handleChange}
                        placeholder="Ex: Golden Retriever" className={INPUT} />
                    </Field>
                    <Field label="Idade">
                      <input type="text" name="idade" value={form.idade} onChange={handleChange}
                        placeholder="Ex: 3 anos" className={INPUT} />
                    </Field>
                    <Field label="Data do Laudo">
                      <input type="date" name="data_laudo" value={form.data_laudo} onChange={handleChange} className={INPUT} />
                    </Field>
                    <div className="sm:col-span-2">
                      <Field label="Médico Veterinário Responsável">
                        <input type="text" name="medico_responsavel" value={form.medico_responsavel}
                          onChange={handleChange} className={INPUT} />
                      </Field>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Upload PDF */}
          {modo === 'upload' && (
            <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
              <div className="h-1 bg-gold-stripe" />
              <div className="p-6">
                <h3 className="text-xs font-bold text-[#19202d] uppercase tracking-widest mb-4">Arquivo PDF</h3>
                <div onClick={() => pdfInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition ${
                    pdfFile ? 'border-[#8a6e36] bg-amber-50' : 'border-gray-200 hover:border-[#8a6e36] hover:bg-amber-50/40'
                  }`}>
                  {pdfFile ? (
                    <>
                      <div className="text-3xl mb-2">📄</div>
                      <p className="font-semibold text-[#19202d]">{pdfFile.name}</p>
                      <p className="text-sm text-gray-400 mt-1">{(pdfFile.size / 1024 / 1024).toFixed(2)} MB</p>
                      <p className="text-xs text-[#8a6e36] mt-2">Clique para trocar</p>
                    </>
                  ) : (
                    <>
                      <div className="text-3xl mb-2">📎</div>
                      <p className="text-gray-500 font-medium">Clique para selecionar o PDF</p>
                      <p className="text-sm text-gray-400 mt-1">Somente arquivos .pdf</p>
                    </>
                  )}
                </div>
                <input ref={pdfInputRef} type="file" accept=".pdf,application/pdf"
                  onChange={handlePdfChange} className="hidden" />
              </div>
            </div>
          )}

          {/* Preencher Laudo */}
          {modo === 'gerar' && (
            <>
              <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
                <div className="h-1 bg-gold-stripe" />
                <div className="p-6">
                  <h3 className="text-xs font-bold text-[#19202d] uppercase tracking-widest mb-4">
                    Texto do Laudo <span className="text-red-400 normal-case font-normal">*</span>
                  </h3>
                  <RichTextEditor
                    value={texto}
                    onChange={setTexto}
                    placeholder="Digite o texto completo do laudo..."
                  />
                  <p className="text-xs text-gray-400 mt-2">
                    Use a barra de ferramentas para negrito, itálico, títulos e listas. A formatação será aplicada no PDF.
                  </p>
                </div>
              </div>

              <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
                <div className="h-1 bg-gold-stripe" />
                <div className="p-6">
                  <h3 className="text-xs font-bold text-[#19202d] uppercase tracking-widest mb-2">
                    Imagens (opcional)
                  </h3>
                  <p className="text-xs text-gray-400 mb-4">
                    Cada imagem será inserida em uma página própria após o texto do laudo.
                  </p>

                  {imagens.length > 0 && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
                      {imagens.map((img, i) => (
                        <div key={i} className="relative group rounded-lg overflow-hidden border border-gray-200">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={URL.createObjectURL(img)} alt={img.name}
                            className="w-full h-24 object-cover" />
                          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                            <button type="button" onClick={() => setImagens(p => p.filter((_, j) => j !== i))}
                              className="text-white text-xs bg-red-500 hover:bg-red-600 px-2 py-1 rounded">
                              Remover
                            </button>
                          </div>
                          <p className="text-[10px] text-gray-400 px-2 py-1 truncate">{img.name}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  <button type="button" onClick={() => imgInputRef.current?.click()}
                    className="w-full border-2 border-dashed border-gray-200 hover:border-[#8a6e36] hover:bg-amber-50/40 rounded-xl p-5 text-center text-sm text-gray-400 transition">
                    🖼️ {imagens.length > 0 ? 'Adicionar mais imagens' : 'Selecionar imagens (PNG / JPG)'}
                  </button>
                  <input ref={imgInputRef} type="file" accept="image/png,image/jpeg,image/jpg"
                    multiple onChange={handleImageChange} className="hidden" />
                </div>
              </div>
            </>
          )}

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{error}</p>
          )}

          <button type="submit" disabled={loading}
            className="w-full bg-[#19202d] hover:bg-[#232d3f] disabled:opacity-50 text-white font-bold py-3 rounded-xl transition text-sm tracking-wide">
            {loading
              ? (modo === 'gerar' ? 'Gerando PDF...' : 'Salvando...')
              : (modo === 'gerar' ? '✨ Gerar e Cadastrar Laudo' : 'Cadastrar Laudo')}
          </button>
        </form>
      </main>
    </div>
  )
}

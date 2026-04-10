'use client'

import { useState, useEffect, useRef } from 'react'

const ESPECIES = ['Cachorro', 'Gato', 'Pássaro', 'Coelho', 'Hamster', 'Réptil', 'Outro']
const SEXOS    = ['Macho', 'Fêmea', 'Não informado']

interface Pet { id: number; nome: string; especie: string | null; raca: string | null; sexo: string | null }

interface Tutor { id: number; nome: string; telefone: string; pets: Pet[] }

export interface PetSelecionado {
  nome:    string
  especie: string | null
  raca:    string | null
  sexo:    string | null
  id:      number | null
}

export interface TutorSelecionado {
  nome:     string
  id:       number | null
  telefone: string
}

interface Props {
  selectedPetNome:  string
  onTutorChange:    (tutor: TutorSelecionado) => void
  onPetSelect:      (pet: PetSelecionado) => void
  inputClass:       string
}

/** Detecta se a query parece um número de telefone (≥ 8 dígitos) */
function looksLikePhone(q: string) {
  return q.replace(/\D/g, '').length >= 8
}

function normPhone(raw: string) {
  const d = raw.replace(/\D/g, '')
  return d.startsWith('55') ? d : `55${d}`
}

export default function TutorBusca({ selectedPetNome, onTutorChange, onPetSelect, inputClass }: Props) {
  const [query,       setQuery]       = useState('')
  const [results,     setResults]     = useState<Tutor[]>([])
  const [searching,   setSearching]   = useState(false)
  const [open,        setOpen]        = useState(false)
  const [tutor,       setTutor]       = useState<Tutor | null>(null)
  // Para tutor novo identificado por nome (precisamos pedir o telefone)
  const [novoTel,     setNovoTel]     = useState('')
  const [novoPetOpen, setNovoPetOpen] = useState(false)
  const [petForm,     setPetForm]     = useState({ nome: '', especie: '', raca: '', sexo: '' })
  const [savingPet,   setSavingPet]   = useState(false)
  const [petErr,      setPetErr]      = useState('')

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wrapRef     = useRef<HTMLDivElement>(null)

  // Fecha dropdown ao clicar fora
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // Debounce de busca
  useEffect(() => {
    if (tutor) return // já selecionou alguém
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (query.length < 2) { setResults([]); setOpen(false); return }

    debounceRef.current = setTimeout(async () => {
      setSearching(true)
      try {
        const res = await fetch(`/api/tutores/buscar?q=${encodeURIComponent(query)}`)
        if (res.ok) {
          const data: Tutor[] = await res.json()
          setResults(data)
          setOpen(true)
        }
      } finally {
        setSearching(false)
      }
    }, 300)

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query, tutor])

  function selectTutor(t: Tutor) {
    setTutor(t)
    setQuery('')
    setOpen(false)
    setResults([])
    setNovoPetOpen(false)
    onTutorChange({ nome: t.nome, id: t.id, telefone: t.telefone })
  }

  function clearTutor() {
    setTutor(null)
    setQuery('')
    setNovoTel('')
    setNovoPetOpen(false)
    onTutorChange({ nome: '', id: null, telefone: '' })
    onPetSelect({ nome: '', especie: null, raca: null, sexo: null, id: null })
  }

  // Quando não encontrou e era um telefone: notifica pai automaticamente
  useEffect(() => {
    if (tutor) return
    if (searching) return
    if (results.length > 0) return
    if (query.length < 2) return
    if (!looksLikePhone(query)) return
    onTutorChange({ nome: '', id: null, telefone: normPhone(query) })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, results, searching, tutor])

  // Quando usuário digita telefone para tutor novo identificado por nome
  function handleNovoTelChange(v: string) {
    setNovoTel(v)
    const digits = v.replace(/\D/g, '')
    if (digits.length >= 8) {
      onTutorChange({ nome: query, id: null, telefone: normPhone(v) })
    }
  }

  async function salvarPet() {
    if (!petForm.nome.trim() || !tutor?.id) { setPetErr('Informe o nome do pet.'); return }
    setSavingPet(true); setPetErr('')
    const res = await fetch(`/api/tutores/${tutor.id}/pets`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        nome:    petForm.nome.trim(),
        especie: petForm.especie || null,
        raca:    petForm.raca.trim() || null,
        sexo:    petForm.sexo || null,
      }),
    })
    if (res.ok) {
      const pet: Pet = await res.json()
      setTutor(t => t ? { ...t, pets: [...t.pets, pet] } : t)
      onPetSelect({ nome: pet.nome, especie: pet.especie, raca: pet.raca, sexo: pet.sexo, id: pet.id })
      setPetForm({ nome: '', especie: '', raca: '', sexo: '' })
      setNovoPetOpen(false)
    } else {
      const d = await res.json()
      setPetErr(d.error ?? 'Erro ao cadastrar pet.')
    }
    setSavingPet(false)
  }

  const INPUT_SM = 'border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#8a6e36] bg-white'

  return (
    <div className="space-y-3">
      {/* Busca de proprietário */}
      <div>
        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
          Proprietário <span className="text-red-400">*</span>
        </label>

        {tutor ? (
          /* Tutor selecionado — chip */
          <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg">
            <span className="text-green-700 font-medium text-sm flex-1">
              ✓ {tutor.nome}
              <span className="ml-2 text-xs font-normal text-green-600">{tutor.telefone}</span>
            </span>
            <button type="button" onClick={clearTutor}
              className="text-green-500 hover:text-green-700 text-lg leading-none shrink-0">×</button>
          </div>
        ) : (
          /* Campo de busca com dropdown */
          <div ref={wrapRef} className="relative">
            <div className="flex items-center gap-0">
              <input
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                onFocus={() => results.length > 0 && setOpen(true)}
                placeholder="Buscar por nome ou telefone..."
                className={inputClass + ' flex-1'}
              />
              {searching && (
                <span className="absolute right-3 text-xs text-gray-400">...</span>
              )}
            </div>

            {open && results.length > 0 && (
              <div className="absolute z-30 top-full mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
                {results.map(t => (
                  <button
                    key={t.id}
                    type="button"
                    onMouseDown={() => selectTutor(t)}
                    className="w-full text-left px-4 py-2.5 hover:bg-amber-50 border-b border-gray-50 last:border-0"
                  >
                    <p className="text-sm font-medium text-[#19202d]">{t.nome}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {t.telefone}
                      {t.pets.length > 0 && <span className="ml-2">· {t.pets.map(p => p.nome).join(', ')}</span>}
                    </p>
                  </button>
                ))}
              </div>
            )}

            {open && query.length >= 2 && !searching && results.length === 0 && (
              <div className="absolute z-30 top-full mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg px-4 py-3">
                {looksLikePhone(query)
                  ? <p className="text-sm text-gray-500">Número não encontrado — será cadastrado ao salvar.</p>
                  : <>
                      <p className="text-sm text-gray-500">Nenhum proprietário com esse nome.</p>
                      <p className="text-xs text-gray-400 mt-0.5">Informe o telefone abaixo para cadastrar.</p>
                    </>
                }
              </div>
            )}
          </div>
        )}

        {/* Tutor novo por nome — pede telefone */}
        {!tutor && query.length >= 2 && !searching && results.length === 0 && !looksLikePhone(query) && (
          <div className="mt-2">
            <input
              type="tel"
              value={novoTel}
              onChange={e => handleNovoTelChange(e.target.value)}
              placeholder="Telefone do novo proprietário"
              className={inputClass + ' w-full'}
            />
          </div>
        )}

        {/* Tutor novo por telefone — confirmação */}
        {!tutor && query.length >= 2 && !searching && results.length === 0 && looksLikePhone(query) && (
          <p className="text-xs mt-1.5 text-amber-700 bg-amber-50 px-2 py-1 rounded">
            ✦ Número não cadastrado — novo proprietário será criado ao salvar.
          </p>
        )}

        {!tutor && query.length < 2 && (
          <p className="text-xs mt-1.5 text-gray-400">
            Digite nome ou telefone. Se não cadastrado, será criado ao salvar.
          </p>
        )}
      </div>

      {/* Pets do tutor selecionado */}
      {tutor && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Animal</label>
            <button
              type="button"
              onClick={() => setNovoPetOpen(v => !v)}
              className="text-xs px-2 py-0.5 rounded border border-dashed border-[#8a6e36]/40 text-[#8a6e36] hover:bg-amber-50 transition"
            >
              {novoPetOpen ? '✕ cancelar' : '+ novo pet'}
            </button>
          </div>

          {tutor.pets.length > 0 && !novoPetOpen && (
            <div className="flex flex-wrap gap-2 mb-2">
              {tutor.pets.map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onPetSelect({ nome: p.nome, especie: p.especie, raca: p.raca, sexo: p.sexo, id: p.id })}
                  className={`text-xs px-3 py-1.5 rounded-lg border transition ${
                    selectedPetNome === p.nome
                      ? 'bg-[#19202d] text-white border-[#19202d]'
                      : 'border-gray-200 hover:border-[#8a6e36] hover:bg-amber-50'
                  }`}
                >
                  {p.nome}
                  {p.especie && <span className="ml-1 opacity-70">({p.especie})</span>}
                </button>
              ))}
            </div>
          )}

          {tutor.pets.length === 0 && !novoPetOpen && (
            <p className="text-xs text-gray-400 mb-2">Nenhum pet cadastrado. Cadastre um abaixo.</p>
          )}

          {novoPetOpen && (
            <div className="p-3 bg-amber-50 border border-[#8a6e36]/20 rounded-lg space-y-2">
              <p className="text-xs font-semibold text-[#8a6e36]">Novo pet</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={petForm.nome}
                  onChange={e => setPetForm(p => ({ ...p, nome: e.target.value }))}
                  placeholder="Nome do pet"
                  autoFocus
                  className={INPUT_SM + ' flex-1'}
                />
                <select
                  value={petForm.especie}
                  onChange={e => setPetForm(p => ({ ...p, especie: e.target.value }))}
                  className={INPUT_SM}
                >
                  <option value="">Espécie</option>
                  {ESPECIES.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={petForm.raca}
                  onChange={e => setPetForm(p => ({ ...p, raca: e.target.value }))}
                  placeholder="Raça (opcional)"
                  className={INPUT_SM + ' flex-1'}
                />
                <select
                  value={petForm.sexo}
                  onChange={e => setPetForm(p => ({ ...p, sexo: e.target.value }))}
                  className={INPUT_SM}
                >
                  <option value="">Sexo</option>
                  {SEXOS.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setNovoPetOpen(false)}
                  className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50">
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={salvarPet}
                  disabled={savingPet}
                  className="text-xs px-3 py-1.5 bg-[#19202d] text-white font-semibold rounded-lg hover:bg-[#232d3f] transition disabled:opacity-50"
                >
                  {savingPet ? '...' : 'Salvar pet'}
                </button>
              </div>
              {petErr && <p className="text-xs text-red-600">{petErr}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

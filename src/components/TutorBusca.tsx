'use client'

import { useState, useEffect, useRef } from 'react'
import { ESPECIES } from '@/lib/especies'
import { normalizeTelefone } from '@/lib/telefone'

const SEXOS = ['Macho', 'Fêmea', 'Não informado']

function formatCPF(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 3) return d
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
}

function normPhone(raw: string) {
  return normalizeTelefone(raw)
}

function looksLikePhone(q: string) {
  return q.replace(/\D/g, '').length >= 8
}

interface Pet {
  id: number
  nome: string
  especie: string | null
  raca: string | null
  sexo: string | null
  data_nascimento: string | null
}

interface Tutor { id: number; nome: string; telefone: string; pets: Pet[] }

export interface PetSelecionado {
  nome:             string
  especie:          string | null
  raca:             string | null
  sexo:             string | null
  id:               number | null
  data_nascimento?: string | null
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

export default function TutorBusca({ selectedPetNome, onTutorChange, onPetSelect, inputClass }: Props) {
  const [query,     setQuery]     = useState('')
  const [results,   setResults]   = useState<Tutor[]>([])
  const [searching, setSearching] = useState(false)
  const [open,      setOpen]      = useState(false)
  const [tutor,     setTutor]     = useState<Tutor | null>(null)

  // Modo criação de novo tutor
  const [tutorNovoMode,    setTutorNovoMode]    = useState(false)
  const [novoNome,         setNovoNome]         = useState('')
  const [novoTel,          setNovoTel]          = useState('')
  const [novoCpf,          setNovoCpf]          = useState('')
  const [salvandoTutor,    setSalvandoTutor]    = useState(false)
  const [tutorErr,         setTutorErr]         = useState('')

  // Novo pet
  const [novoPetOpen,      setNovoPetOpen]      = useState(false)
  const [petNome,          setPetNome]          = useState('')
  const [petEspecie,       setPetEspecie]       = useState('')
  const [petRaca,          setPetRaca]          = useState('')
  const [petSexo,          setPetSexo]          = useState('')
  const [petNascimento,    setPetNascimento]    = useState('')
  const [petPelagem,       setPetPelagem]       = useState('')
  const [petTemperamento,  setPetTemperamento]  = useState('')
  const [petCastrado,      setPetCastrado]      = useState(false)
  const [savingPet,        setSavingPet]        = useState(false)
  const [petErr,           setPetErr]           = useState('')

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wrapRef     = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  useEffect(() => {
    if (tutor || tutorNovoMode) return
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
  }, [query, tutor, tutorNovoMode])

  function selectTutor(t: Tutor) {
    setTutor(t)
    setQuery('')
    setOpen(false)
    setResults([])
    setTutorNovoMode(false)
    setNovoNome('')
    setNovoTel('')
    setNovoCpf('')
    setTutorErr('')
    onTutorChange({ nome: t.nome, id: t.id, telefone: t.telefone })
  }

  function clearTutor() {
    setTutor(null)
    setQuery('')
    setResults([])
    setTutorNovoMode(false)
    setNovoNome('')
    setNovoTel('')
    setNovoCpf('')
    setTutorErr('')
    setNovoPetOpen(false)
    onTutorChange({ nome: '', id: null, telefone: '' })
    onPetSelect({ nome: '', especie: null, raca: null, sexo: null, id: null })
  }

  function enterNovoMode() {
    setOpen(false)
    setTutorNovoMode(true)
    setTutorErr('')
    if (looksLikePhone(query)) {
      setNovoTel(query)
      setNovoNome('')
    } else {
      setNovoNome(query)
      setNovoTel('')
    }
  }

  async function confirmarNovoTutor() {
    setTutorErr('')
    const tel = novoTel.replace(/\D/g, '')
    if (!novoNome.trim()) { setTutorErr('Informe o nome do proprietário.'); return }
    if (tel.length < 8)   { setTutorErr('Informe o telefone (mínimo 8 dígitos).'); return }
    setSalvandoTutor(true)
    const res = await fetch('/api/tutores', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        nome:     novoNome.trim(),
        telefone: normPhone(novoTel),
        cpf:      novoCpf.replace(/\D/g, '') || null,
      }),
    })
    if (res.ok) {
      const t: Tutor = await res.json()
      selectTutor(t)
    } else {
      const d = await res.json()
      setTutorErr(d.error ?? 'Erro ao cadastrar proprietário.')
    }
    setSalvandoTutor(false)
  }

  function resetPetForm() {
    setPetNome(''); setPetEspecie(''); setPetRaca(''); setPetSexo('')
    setPetNascimento(''); setPetPelagem(''); setPetTemperamento(''); setPetCastrado(false)
  }

  async function salvarPet() {
    if (!petNome.trim() || !tutor?.id) { setPetErr('Informe o nome do pet.'); return }
    setSavingPet(true); setPetErr('')
    const res = await fetch(`/api/tutores/${tutor.id}/pets`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        nome:             petNome.trim(),
        especie:          petEspecie  || null,
        raca:             petRaca.trim()     || null,
        sexo:             petSexo     || null,
        data_nascimento:  petNascimento      || null,
        pelagem:          petPelagem.trim()  || null,
        castrado:         petCastrado,
        temperamento:     petTemperamento    || null,
      }),
    })
    if (res.ok) {
      const pet: Pet = await res.json()
      setTutor(t => t ? { ...t, pets: [...t.pets, pet] } : t)
      onPetSelect({
        nome: pet.nome, especie: pet.especie, raca: pet.raca,
        sexo: pet.sexo, id: pet.id, data_nascimento: pet.data_nascimento,
      })
      resetPetForm()
      setNovoPetOpen(false)
    } else {
      const d = await res.json()
      setPetErr(d.error ?? 'Erro ao cadastrar pet.')
    }
    setSavingPet(false)
  }

  const SM = 'border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#8a6e36] bg-white'

  return (
    <div className="space-y-3">
      {/* ── Proprietário ── */}
      <div>
        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
          Proprietário <span className="text-red-400">*</span>
        </label>

        {tutor ? (
          /* Chip tutor confirmado */
          <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg">
            <span className="text-green-700 font-medium text-sm flex-1">
              ✓ {tutor.nome}
              <span className="ml-2 text-xs font-normal text-green-600">{tutor.telefone}</span>
            </span>
            <button type="button" onClick={clearTutor}
              className="text-green-500 hover:text-green-700 text-lg leading-none shrink-0">×</button>
          </div>

        ) : tutorNovoMode ? (
          /* Formulário novo tutor */
          <div className="p-3 bg-amber-50 border border-[#8a6e36]/20 rounded-lg space-y-2">
            <p className="text-xs font-semibold text-[#8a6e36]">Novo proprietário</p>
            <input
              type="text"
              value={novoNome}
              onChange={e => setNovoNome(e.target.value)}
              placeholder="Nome completo *"
              autoFocus
              className={SM + ' w-full'}
            />
            <input
              type="tel"
              value={novoTel}
              onChange={e => setNovoTel(e.target.value)}
              placeholder="Telefone * Ex: (24) 99999-9999"
              className={SM + ' w-full'}
            />
            <input
              type="text"
              inputMode="numeric"
              value={novoCpf}
              onChange={e => setNovoCpf(formatCPF(e.target.value))}
              placeholder="CPF (opcional)"
              className={SM + ' w-full'}
            />
            {tutorErr && <p className="text-xs text-red-600">{tutorErr}</p>}
            <div className="flex justify-between gap-2 pt-1">
              <button type="button"
                onClick={() => { setTutorNovoMode(false); setTutorErr('') }}
                className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50">
                ← Voltar
              </button>
              <button type="button" onClick={confirmarNovoTutor} disabled={salvandoTutor}
                className="text-xs px-3 py-1.5 bg-[#19202d] text-white font-semibold rounded-lg hover:bg-[#232d3f] transition disabled:opacity-50">
                {salvandoTutor ? '...' : 'Confirmar proprietário'}
              </button>
            </div>
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
              {searching && <span className="absolute right-3 text-xs text-gray-400">...</span>}
            </div>

            {/* Dropdown com resultados */}
            {open && results.length > 0 && (
              <div className="absolute z-30 top-full mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
                {results.map(t => (
                  <button key={t.id} type="button" onMouseDown={() => selectTutor(t)}
                    className="w-full text-left px-4 py-2.5 hover:bg-amber-50 border-b border-gray-50 last:border-0">
                    <p className="text-sm font-medium text-[#19202d]">{t.nome}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {t.telefone}
                      {t.pets.length > 0 && <span className="ml-2">· {t.pets.map(p => p.nome).join(', ')}</span>}
                    </p>
                  </button>
                ))}
                <button type="button" onMouseDown={enterNovoMode}
                  className="w-full text-left px-4 py-2.5 text-[#8a6e36] text-sm font-medium hover:bg-amber-50 border-t border-gray-100">
                  + Cadastrar como novo proprietário
                </button>
              </div>
            )}

            {/* Dropdown sem resultados */}
            {open && query.length >= 2 && !searching && results.length === 0 && (
              <div className="absolute z-30 top-full mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg px-4 py-3">
                <p className="text-sm text-gray-500">Nenhum proprietário encontrado.</p>
                <button type="button" onMouseDown={enterNovoMode}
                  className="mt-1.5 text-sm text-[#8a6e36] font-medium hover:underline">
                  + Cadastrar como novo proprietário
                </button>
              </div>
            )}
          </div>
        )}

        {!tutor && !tutorNovoMode && query.length < 2 && (
          <p className="text-xs mt-1.5 text-gray-400">
            Digite nome ou telefone para buscar ou cadastrar.
          </p>
        )}
      </div>

      {/* ── Pets do tutor selecionado ── */}
      {tutor && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Animal</label>
            <button type="button" onClick={() => { setNovoPetOpen(v => !v); if (novoPetOpen) resetPetForm() }}
              className="text-xs px-2 py-0.5 rounded border border-dashed border-[#8a6e36]/40 text-[#8a6e36] hover:bg-amber-50 transition">
              {novoPetOpen ? '✕ cancelar' : '+ novo pet'}
            </button>
          </div>

          {tutor.pets.length > 0 && !novoPetOpen && (
            <div className="flex flex-wrap gap-2 mb-2">
              {tutor.pets.map(p => (
                <button key={p.id} type="button"
                  onClick={() => onPetSelect({
                    nome: p.nome, especie: p.especie, raca: p.raca,
                    sexo: p.sexo, id: p.id, data_nascimento: p.data_nascimento,
                  })}
                  className={`text-xs px-3 py-1.5 rounded-lg border transition ${
                    selectedPetNome === p.nome
                      ? 'bg-[#19202d] text-white border-[#19202d]'
                      : 'border-gray-200 hover:border-[#8a6e36] hover:bg-amber-50'
                  }`}>
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

              <input type="text" value={petNome} onChange={e => setPetNome(e.target.value)}
                placeholder="Nome do pet *" autoFocus className={SM + ' w-full'} />

              <div className="grid grid-cols-2 gap-2">
                <select value={petEspecie} onChange={e => setPetEspecie(e.target.value)} className={SM}>
                  <option value="">Espécie</option>
                  {ESPECIES.map(s => <option key={s}>{s}</option>)}
                </select>
                <input type="text" value={petRaca} onChange={e => setPetRaca(e.target.value)}
                  placeholder="Raça" className={SM} />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <select value={petSexo} onChange={e => setPetSexo(e.target.value)} className={SM}>
                  <option value="">Sexo</option>
                  {SEXOS.map(s => <option key={s}>{s}</option>)}
                </select>
                <div>
                  <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Nascimento</label>
                  <input type="date" value={petNascimento} onChange={e => setPetNascimento(e.target.value)}
                    className={SM + ' w-full'} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <input type="text" value={petPelagem} onChange={e => setPetPelagem(e.target.value)}
                  placeholder="Pelagem (ex: Dourada)" className={SM} />
                <select value={petTemperamento} onChange={e => setPetTemperamento(e.target.value)} className={SM}>
                  <option value="">Temperamento</option>
                  <option value="manso">Manso</option>
                  <option value="medroso">Medroso</option>
                  <option value="reativo">Reativo</option>
                  <option value="bravo">Bravo</option>
                </select>
              </div>

              <label className="flex items-center gap-2 text-sm text-[#19202d] cursor-pointer">
                <input type="checkbox" checked={petCastrado} onChange={e => setPetCastrado(e.target.checked)}
                  className="w-4 h-4 accent-[#8a6e36]" />
                Castrado
              </label>

              {petErr && <p className="text-xs text-red-600">{petErr}</p>}

              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => { setNovoPetOpen(false); resetPetForm() }}
                  className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50">
                  Cancelar
                </button>
                <button type="button" onClick={salvarPet} disabled={savingPet}
                  className="text-xs px-3 py-1.5 bg-[#19202d] text-white font-semibold rounded-lg hover:bg-[#232d3f] transition disabled:opacity-50">
                  {savingPet ? '...' : 'Salvar pet'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

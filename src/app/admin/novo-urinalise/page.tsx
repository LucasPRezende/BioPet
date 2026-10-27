'use client'

import { useState, useRef, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import LaudoSucesso from '@/components/LaudoSucesso'
import { ESPECIES } from '@/lib/especies'
import {
  CAMPOS_FISICO, CAMPOS_SEDIMENTO, fitaDoExame, parametrosDaFita, parametrosFaltando, validarUrinalise,
  type CampoManual, type TipoFita,
} from '@/lib/urinalise'

interface AgendamentoInfo {
  tutor:    string
  telefone: string
  pet_nome: string
  especie:  string
  raca:     string
  sexo:     string
  idade:    string
  tutor_id: number | null
  pet_id:   number | null
}

interface Leitura { numero_amostra: string; data: string; desconhecidos: string[] }

const INPUT = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3BA7B0] focus:border-transparent bg-white'
const INPUT_VAL = 'w-full border border-gray-200 rounded-md px-2 py-1 text-sm text-right font-mono focus:outline-none focus:ring-2 focus:ring-[#3BA7B0] bg-white'

function calcIdadeDeNascimento(dataNasc: string): string {
  const nasc = new Date(dataNasc)
  const hoje = new Date()
  let anos = hoje.getFullYear() - nasc.getFullYear()
  let meses = hoje.getMonth() - nasc.getMonth()
  if (hoje.getDate() < nasc.getDate()) meses--
  if (meses < 0) { anos--; meses += 12 }
  if (anos < 1) return `${meses} ${meses === 1 ? 'mês' : 'meses'}`
  return `${anos} ${anos === 1 ? 'ano' : 'anos'}`
}

function NovoUrinaliseContent() {
  const router        = useRouter()
  const searchParams  = useSearchParams()
  const agendamentoId = searchParams.get('agendamento_id')
  const fitaDoAgendamento = fitaDoExame(searchParams.get('tipo_exame'))

  const fileInputRef = useRef<HTMLInputElement>(null)

  const [loadingAg, setLoadingAg] = useState(false)
  const [agInfo,    setAgInfo]    = useState<AgendamentoInfo | null>(null)
  const [vets,      setVets]      = useState<{ id: number; nome: string }[]>([])
  const [vetId,     setVetId]     = useState<number | null>(null)

  const [fita,        setFita]        = useState<TipoFita>(fitaDoAgendamento ?? 11)
  const [step,        setStep]        = useState<'upload' | 'revisao'>('upload')
  const [fotos,       setFotos]       = useState<File[]>([])
  const [fotosUrl,    setFotosUrl]    = useState<string[]>([])
  const [lendo,       setLendo]       = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [leitura,     setLeitura]     = useState<Leitura | null>(null)

  const [valores,     setValores]     = useState<Record<string, string>>({})
  const [fisico,      setFisico]      = useState<Record<string, string>>({})
  const [sedimento,   setSedimento]   = useState<Record<string, string>>({})
  const [observacoes, setObservacoes] = useState('')

  const [previewUrl,    setPreviewUrl]    = useState<string | null>(null)
  const [previewing,    setPreviewing]    = useState(false)
  const [desatualizada, setDesatualizada] = useState(false)
  const [saving,        setSaving]        = useState(false)
  const [erro,          setErro]          = useState('')

  const [success, setSuccess] = useState<{ id: number; tutor: string; telefone: string; nome_pet: string } | null>(null)

  const [form, setForm] = useState({
    nome_pet:   '',
    especie:    '',
    raca:       '',
    sexo:       '',
    idade:      '',
    tutor:      '',
    telefone:   '',
    clinica:    '',
    material:   'Urina',
    data_laudo: new Date().toLocaleDateString('en-CA'),
  })

  useEffect(() => {
    fetch('/api/veterinarios').then(r => r.ok ? r.json() : []).then(setVets).catch(() => {})
  }, [])

  useEffect(() => {
    if (!agendamentoId) return
    setLoadingAg(true)
    fetch(`/api/agendamentos/${agendamentoId}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d) return
        const tutor = (Array.isArray(d.tutores) ? d.tutores[0] : d.tutores) as { id: number; nome: string; telefone: string } | null
        const pet   = (Array.isArray(d.pets) ? d.pets[0] : d.pets) as
          { id: number; nome: string; especie: string; raca: string; sexo?: string; data_nascimento?: string } | null
        if (d.veterinario_id) setVetId(Number(d.veterinario_id))
        const info: AgendamentoInfo = {
          tutor:    tutor?.nome     ?? '',
          telefone: tutor?.telefone ?? '',
          pet_nome: pet?.nome       ?? '',
          especie:  pet?.especie    ?? '',
          raca:     pet?.raca       ?? '',
          sexo:     pet?.sexo       ?? '',
          idade:    pet?.data_nascimento ? calcIdadeDeNascimento(pet.data_nascimento) : '',
          tutor_id: tutor?.id       ?? null,
          pet_id:   pet?.id         ?? null,
        }
        setAgInfo(info)
        setForm(p => ({
          ...p,
          nome_pet: info.pet_nome, especie: info.especie, raca: info.raca, sexo: info.sexo,
          idade: info.idade || p.idade, tutor: info.tutor, telefone: info.telefone,
        }))
      })
      .catch(() => {})
      .finally(() => setLoadingAg(false))
  }, [agendamentoId])

  // Miniaturas das fotos para conferir lado a lado com os valores
  useEffect(() => {
    const urls = fotos.map(f => URL.createObjectURL(f))
    setFotosUrl(urls)
    return () => urls.forEach(u => URL.revokeObjectURL(u))
  }, [fotos])

  function adicionarFotos(lista: FileList | File[]) {
    const novas = Array.from(lista).filter(f => f.type.startsWith('image/'))
    if (novas.length === 0) { setUploadError('Envie fotos (JPG, PNG ou HEIC).'); return }
    setUploadError('')
    setFotos(prev => [...prev, ...novas].slice(0, 4))
  }

  async function lerFotos() {
    if (fotos.length === 0) return
    setLendo(true)
    setUploadError('')
    const fd = new FormData()
    fotos.forEach(f => fd.append('fotos', f))
    const res = await fetch('/api/laudos/ler-urina', { method: 'POST', body: fd }).catch(() => null)
    if (!res || !res.ok) {
      const d = res ? await res.json().catch(() => ({})) : {}
      setUploadError(d.error ?? 'Erro ao ler a foto.')
      setLendo(false)
      return
    }
    const d = await res.json() as Leitura & { valores: Record<string, string> }
    setLeitura({ numero_amostra: d.numero_amostra, data: d.data, desconhecidos: d.desconhecidos ?? [] })
    setValores(d.valores)
    // A 14G tem parâmetros que a 11G não tem: se vierem na foto, a fita é a 14
    // (a não ser que o agendamento diga outra coisa — aí a validação avisa).
    if (!fitaDoAgendamento && ['MA', 'CA', 'CR', 'ACR'].some(k => d.valores[k])) setFita(14)
    if (d.data) setForm(p => ({ ...p, data_laudo: d.data }))
    setLendo(false)
    setStep('revisao')
    setDesatualizada(true)
  }

  function preencherAMao() {
    setLeitura(null)
    setValores({})
    setStep('revisao')
  }

  function montarLaudo() {
    const vetNome = vets.find(v => v.id === vetId)?.nome ?? ''
    const limpar = (o: Record<string, string>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v.trim() !== ''))
    return {
      nome_pet:    form.nome_pet.trim(),
      especie:     form.especie,
      raca:        form.raca,
      sexo:        form.sexo,
      idade:       form.idade,
      peso:        '',
      tutor:       form.tutor,
      telefone:    form.telefone,
      medico:      vetNome,
      crmv:        '',
      clinica:     form.clinica,
      material:    form.material,
      data_laudo:  form.data_laudo,
      titulo:      'Urinálise',
      fita,
      valores:     limpar(valores),
      fisico:      limpar(fisico),
      sedimento:   limpar(sedimento),
      observacoes,
    }
  }

  async function gerarPrevia() {
    const v = validarUrinalise(montarLaudo())
    if (v) { setErro(v); return }
    setPreviewing(true)
    setErro('')
    try {
      const res = await fetch('/api/laudos/preview-urinalise', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ laudo: montarLaudo() }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setErro(d.error ?? 'Erro ao gerar a prévia.')
      } else {
        const blob = await res.blob()
        if (previewUrl) URL.revokeObjectURL(previewUrl)
        setPreviewUrl(URL.createObjectURL(blob))
        setDesatualizada(false)
      }
    } catch {
      setErro('Erro ao gerar a prévia.')
    }
    setPreviewing(false)
  }

  async function salvar() {
    const v = validarUrinalise(montarLaudo())
    if (v) { setErro(v); return }
    setSaving(true)
    setErro('')
    const res = await fetch('/api/laudos/salvar-urinalise', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        laudo:          montarLaudo(),
        veterinario_id: vetId,
        tutor_id:       agInfo?.tutor_id ?? null,
        pet_id:         agInfo?.pet_id   ?? null,
        agendamento_id: agendamentoId ? parseInt(agendamentoId, 10) : null,
      }),
    }).catch(() => null)
    if (res?.ok) {
      const laudo = await res.json()
      if (previewUrl) URL.revokeObjectURL(previewUrl)
      setSuccess({ id: laudo.id, tutor: laudo.tutor, telefone: laudo.telefone, nome_pet: laudo.nome_pet })
    } else {
      const d = res ? await res.json().catch(() => ({})) : {}
      setErro(d.error ?? 'Erro ao salvar laudo.')
    }
    setSaving(false)
  }

  function recomecar() {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(null)
    setFotos([])
    setLeitura(null)
    setValores({})
    setErro('')
    setUploadError('')
    setStep('upload')
  }

  // Gera a primeira prévia sozinha ao entrar na revisão (se já há resultado)
  useEffect(() => {
    if (step === 'revisao' && !previewUrl && !previewing && form.nome_pet && form.especie && Object.keys(valores).length) gerarPrevia()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  if (success) {
    return (
      <LaudoSucesso
        laudoId={success.id}
        tutor={success.tutor}
        telefone={success.telefone}
        titulo="Laudo salvo!"
        subtitulo={`${success.nome_pet} · ${success.tutor}`}
      />
    )
  }

  const campo = (label: string, el: React.ReactNode) => (
    <div>
      <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">{label}</label>
      {el}
    </div>
  )
  const setF = (k: keyof typeof form, v: string) => { setForm(p => ({ ...p, [k]: v })); setDesatualizada(true) }

  const camposManuais = (titulo: string, campos: CampoManual[], vals: Record<string, string>,
                         set: (f: (p: Record<string, string>) => Record<string, string>) => void) => (
    <div>
      <p className="text-[11px] font-bold text-[#2a8f98] uppercase tracking-wider mb-1.5">{titulo}</p>
      <div className="space-y-1">
        {campos.map(c => (
          <div key={c.codigo} className="grid grid-cols-[1fr_170px] gap-2 items-center text-sm">
            <span className="text-[#19202d]">
              {c.nome}
              {c.referencia && <span className="text-[10px] text-gray-400 ml-1">({c.referencia})</span>}
            </span>
            <input value={vals[c.codigo] ?? ''} list={c.opcoes ? `op-${c.codigo}` : undefined}
              onChange={e => { const v = e.target.value; set(p => ({ ...p, [c.codigo]: v })); setDesatualizada(true) }}
              className="w-full border border-gray-200 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[#3BA7B0] bg-white" />
            {c.opcoes && <datalist id={`op-${c.codigo}`}>{c.opcoes.map(o => <option key={o} value={o} />)}</datalist>}
          </div>
        ))}
      </div>
    </div>
  )

  const faltando = parametrosFaltando(fita, valores)
  const lidoDaFoto = leitura !== null

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-6xl mx-auto px-4 py-8 space-y-5">

        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={() => step === 'upload' ? router.back() : recomecar()}
            className="text-gray-400 hover:text-gray-600 transition text-sm">
            ← Voltar
          </button>
          <div>
            <h1 className="text-2xl font-bold text-[#19202d]">🧫 Urinálise ({fita} parâmetros)</h1>
            <p className="text-sm text-gray-400 mt-0.5">
              {step === 'upload' ? 'Fotografe a tela ou a impressão do analisador de urina' : 'Confira os valores com a foto e salve o laudo'}
            </p>
          </div>
          {agendamentoId && (
            <span className="ml-auto text-xs bg-amber-50 text-amber-700 border border-amber-200 px-3 py-1.5 rounded-full font-semibold">
              Agendamento #{agendamentoId}
            </span>
          )}
        </div>

        {agendamentoId && (
          <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
            <div className="h-1 bg-gradient-to-r from-amber-300 to-amber-500" />
            <div className="p-5">
              {loadingAg ? (
                <p className="text-sm text-gray-400">Carregando dados do agendamento...</p>
              ) : agInfo ? (
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-x-6 gap-y-2 text-sm">
                  {[
                    { label: 'Paciente', value: agInfo.pet_nome },
                    { label: 'Espécie',  value: agInfo.especie },
                    { label: 'Raça',     value: agInfo.raca },
                    { label: 'Tutor',    value: agInfo.tutor },
                    { label: 'Telefone', value: agInfo.telefone },
                  ].map(({ label, value }) => (
                    <div key={label}>
                      <span className="text-[11px] text-gray-400 uppercase tracking-wide">{label}</span>
                      <p className="font-semibold text-[#19202d] truncate">{value || '—'}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400">Agendamento não encontrado.</p>
              )}
            </div>
          </div>
        )}

        {step === 'upload' && (
          <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
            <div className="h-1 bg-gradient-to-r from-[#3BA7B0] to-[#2a8f98]" />
            <div className="p-5 space-y-4">
              {!fitaDoAgendamento && (
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Fita</span>
                  {([11, 14] as TipoFita[]).map(f => (
                    <button key={f} onClick={() => setFita(f)}
                      className={`text-sm font-semibold px-4 py-1.5 rounded-lg border transition ${fita === f
                        ? 'bg-[#3BA7B0] border-[#3BA7B0] text-white' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                      URIT {f}G · {f} parâmetros
                    </button>
                  ))}
                </div>
              )}

              <div
                className="rounded-2xl border-2 border-dashed border-gray-200 hover:border-[#3BA7B0]/50 transition-colors cursor-pointer"
                onDrop={e => { e.preventDefault(); adicionarFotos(e.dataTransfer.files) }}
                onDragOver={e => e.preventDefault()}
                onClick={() => !lendo && fileInputRef.current?.click()}
              >
                <div className="flex flex-col items-center justify-center py-14 px-6 text-center">
                  <div className="text-5xl mb-3">📷</div>
                  <p className="text-[#19202d] font-bold text-lg mb-1">Tirar ou escolher foto</p>
                  <p className="text-gray-400 text-sm">Tela do aparelho ou papel impresso — reto, perto e sem reflexo</p>
                  {fita === 14 && (
                    <p className="text-[12px] text-indigo-600 mt-3">
                      Fita 14: a tela não mostra tudo de uma vez — tire uma foto de cada tela (ou fotografe a impressão).
                    </p>
                  )}
                </div>
                <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden"
                  onChange={e => { if (e.target.files) adicionarFotos(e.target.files); e.target.value = '' }} />
              </div>

              {fotos.length > 0 && (
                <div className="flex gap-3 flex-wrap">
                  {fotosUrl.map((u, i) => (
                    <div key={u} className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={u} alt={`Foto ${i + 1}`} className="h-28 w-auto rounded-lg border object-cover" />
                      <button onClick={() => setFotos(prev => prev.filter((_, j) => j !== i))}
                        className="absolute -top-2 -right-2 bg-white border rounded-full w-6 h-6 text-xs text-gray-500 hover:text-red-600 shadow-sm">✕</button>
                    </div>
                  ))}
                </div>
              )}

              {uploadError && (
                <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{uploadError}</div>
              )}

              <div className="flex gap-3 flex-wrap">
                <button onClick={lerFotos} disabled={fotos.length === 0 || lendo}
                  className="flex-1 min-w-[200px] bg-[#3BA7B0] hover:bg-[#2a8f98] disabled:opacity-50 text-white font-bold py-3 rounded-xl transition text-sm">
                  {lendo ? 'Lendo a foto... (até 30s)' : `Ler ${fotos.length > 1 ? `${fotos.length} fotos` : 'foto'}`}
                </button>
                <button onClick={preencherAMao} disabled={lendo}
                  className="border border-gray-200 text-gray-500 font-semibold px-5 py-3 rounded-xl text-sm hover:bg-gray-50 transition">
                  Preencher à mão
                </button>
              </div>
            </div>
          </div>
        )}

        {step === 'revisao' && (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_440px] gap-5 items-start">

            {/* Prévia */}
            <div className="bg-white rounded-xl border shadow-sm overflow-hidden lg:sticky lg:top-4">
              <div className="h-1 bg-gradient-to-r from-[#3BA7B0] to-[#2a8f98]" />
              <div className="p-4">
                <div className="flex items-center gap-3 mb-3">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Pré-visualização do laudo</p>
                  {desatualizada && previewUrl && (
                    <span className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">desatualizada</span>
                  )}
                  <button onClick={gerarPrevia} disabled={previewing}
                    className="ml-auto text-xs font-semibold text-[#2a8f98] border border-[#3BA7B0]/40 rounded-lg px-3 py-1.5 hover:bg-[#3BA7B0]/10 disabled:opacity-50">
                    {previewing ? 'Gerando...' : '↻ Atualizar prévia'}
                  </button>
                </div>
                {previewUrl ? (
                  <iframe src={previewUrl} className="w-full rounded-lg border border-gray-100"
                    style={{ height: '78vh', minHeight: '600px' }} title="Pré-visualização do laudo" />
                ) : (
                  <div className="h-[40vh] flex items-center justify-center text-sm text-gray-400 text-center px-6">
                    {previewing ? 'Gerando prévia...' : 'Preencha paciente, espécie e os resultados e clique em Atualizar prévia.'}
                  </div>
                )}
              </div>
            </div>

            {/* Formulário */}
            <div className="space-y-4">
              <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
                <div className="h-1 bg-gold-stripe" />
                <div className="p-5 space-y-3">
                  <h2 className="text-xs font-bold text-[#19202d] uppercase tracking-widest">Paciente</h2>
                  <div className="grid grid-cols-2 gap-3">
                    {campo('Nome', <input value={form.nome_pet} onChange={e => setF('nome_pet', e.target.value)} className={INPUT} />)}
                    {campo('Espécie', (
                      <select value={form.especie} onChange={e => setF('especie', e.target.value)} className={INPUT}>
                        <option value="">—</option>
                        {ESPECIES.map(e => <option key={e}>{e}</option>)}
                      </select>
                    ))}
                    {campo('Raça', <input value={form.raca} onChange={e => setF('raca', e.target.value)} className={INPUT} />)}
                    {campo('Sexo', (
                      <select value={form.sexo} onChange={e => setF('sexo', e.target.value)} className={INPUT}>
                        <option value="">—</option>
                        <option>Macho</option>
                        <option>Fêmea</option>
                      </select>
                    ))}
                    {campo('Idade', <input value={form.idade} placeholder="ex: 3 anos" onChange={e => setF('idade', e.target.value)} className={INPUT} />)}
                    {campo('Tutor', <input value={form.tutor} onChange={e => setF('tutor', e.target.value)} className={INPUT} />)}
                    {campo('Telefone', <input value={form.telefone} onChange={e => setF('telefone', e.target.value)} className={INPUT} />)}
                    {campo('Médico Responsável', (
                      <select value={vetId ?? ''} onChange={e => { setVetId(e.target.value ? Number(e.target.value) : null); setDesatualizada(true) }} className={INPUT}>
                        <option value="">— Não informado</option>
                        {vets.map(v => <option key={v.id} value={v.id}>{v.nome}</option>)}
                      </select>
                    ))}
                    {campo('Clínica', <input value={form.clinica} onChange={e => setF('clinica', e.target.value)} className={INPUT} />)}
                    {campo('Data do laudo', <input type="date" value={form.data_laudo} onChange={e => setF('data_laudo', e.target.value)} className={INPUT} />)}
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
                <div className="h-1 bg-gradient-to-r from-[#3BA7B0] to-[#2a8f98]" />
                <div className="p-5 space-y-4">
                  {camposManuais('Exame físico', CAMPOS_FISICO, fisico, setFisico)}

                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-[11px] font-bold text-[#2a8f98] uppercase tracking-wider">Exame químico — fita {fita}G</p>
                      {!fitaDoAgendamento && (
                        <button onClick={() => { setFita(fita === 11 ? 14 : 11); setDesatualizada(true) }}
                          className="ml-auto text-[11px] text-gray-500 border border-gray-200 rounded px-2 py-0.5 hover:bg-gray-50">
                          trocar para {fita === 11 ? 14 : 11}G
                        </button>
                      )}
                    </div>
                    {lidoDaFoto && (
                      <p className="text-[11px] text-gray-400 mb-2">
                        Lido da foto{leitura.numero_amostra ? ` · amostra Nº ${leitura.numero_amostra}` : ''}{leitura.data ? ` · ${leitura.data.split('-').reverse().join('/')}` : ''}. Confira cada valor com a foto.
                      </p>
                    )}
                    {fotosUrl.length > 0 && (
                      <div className="flex gap-2 mb-2 flex-wrap">
                        {fotosUrl.map((u, i) => (
                          <a key={u} href={u} target="_blank" rel="noreferrer">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={u} alt={`Foto ${i + 1}`} className="h-20 w-auto rounded border object-cover hover:opacity-80" />
                          </a>
                        ))}
                      </div>
                    )}
                    {lidoDaFoto && faltando.length > 0 && (
                      <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1 mb-2">
                        A foto não trouxe: <b>{faltando.map(p => p.codigo).join(', ')}</b>. Preencha à mão ou volte e adicione a outra tela.
                      </p>
                    )}
                    {lidoDaFoto && leitura.desconhecidos.length > 0 && (
                      <p className="text-[11px] text-gray-500 mb-2">Ignorado da foto: {leitura.desconhecidos.join(', ')}</p>
                    )}
                    <div className="space-y-1">
                      {parametrosDaFita(fita).map(p => {
                        const vazio = !(valores[p.codigo] ?? '').trim()
                        return (
                          <div key={p.codigo} className="grid grid-cols-[1fr_120px_56px] gap-2 items-center text-sm">
                            <span className={vazio && p.codigo !== 'ACR' ? 'text-amber-700' : 'text-[#19202d]'}>
                              {p.nome} <span className="text-[10px] text-gray-400 font-mono">{p.codigo}</span>
                            </span>
                            <input value={valores[p.codigo] ?? ''} placeholder={p.qualitativo ? 'Neg / Pos' : p.codigo === 'URO' ? 'Normal / 2.0' : ''}
                              onChange={e => { const v = e.target.value; setValores(prev => ({ ...prev, [p.codigo]: v })); setDesatualizada(true) }}
                              className={INPUT_VAL} />
                            <span className="text-xs text-gray-400">{p.unidade}</span>
                          </div>
                        )
                      })}
                    </div>
                    <p className="text-[11px] text-gray-400 mt-1.5">Valores como a máquina mostra: &quot;Neg&quot;, &quot;Normal&quot;, &quot;&lt;=1&quot;, &quot;0.5&quot;, &quot;1.025&quot;.</p>
                  </div>

                  {camposManuais('Sedimentoscopia', CAMPOS_SEDIMENTO, sedimento, setSedimento)}

                  {campo('Observações', (
                    <textarea value={observacoes} rows={3}
                      onChange={e => { setObservacoes(e.target.value); setDesatualizada(true) }}
                      className={INPUT} placeholder="Opcional — sai no laudo abaixo dos resultados" />
                  ))}
                  <p className="text-[11px] text-gray-400 -mt-2">Campos vazios do exame físico e do sedimento não aparecem no laudo.</p>
                </div>
              </div>

              {erro && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{erro}</p>}

              <button onClick={salvar} disabled={saving}
                className="w-full bg-[#3BA7B0] hover:bg-[#2a8f98] disabled:opacity-50 text-white font-bold py-3.5 rounded-xl transition text-sm tracking-wide">
                {saving ? 'Salvando...' : '✨ Salvar como Laudo'}
              </button>
              <button onClick={recomecar}
                className="w-full border border-gray-200 text-gray-500 font-semibold py-2.5 rounded-xl text-sm hover:bg-gray-50 transition">
                ← Ler outra foto
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

export default function NovoUrinalisePage() {
  return (
    <Suspense>
      <NovoUrinaliseContent />
    </Suspense>
  )
}

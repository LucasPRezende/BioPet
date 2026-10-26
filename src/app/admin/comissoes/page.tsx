'use client'

// Tela de Preços (versão 2a do handoff de design).
//
// - Edição direto na tabela. Nada é salvo na hora: cada edição fica PENDENTE
//   (célula amarela com ●) e só vai para o banco em "Revisar e salvar", num lote
//   transacional que grava o histórico (/api/comissoes/alteracoes, migration v49).
// - O modal ⋯ de um exame salva direto (ele já é a confirmação).
// - Exame/sub-exame/teste novo nasce inativo.
// - Regra de preço: só mostra o resultado de precoExame() (lib/precos-regras).

import { useState, useEffect, useCallback, useMemo } from 'react'
import { ehAgrupador } from '@/lib/comissao-exame'
import {
  combinacoesZeradas, explicarVazio, podeAtivar, parseValorBR, fmtValor, valorEfetivo,
  type CampoPreco,
} from '@/lib/precos-regras'

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface Comissao {
  id:                        number
  tipo_exame:                string
  custo_exame:               number
  comissao_laudo:            number
  comissao_clinica:          number
  comissao_extracao:         number
  varia_por_horario:         boolean
  permite_multiplo:          boolean
  ativo:                     boolean
  preco_pix_comercial:       number | null
  preco_cartao_comercial:    number | null
  preco_pix_fora_horario:    number | null
  preco_cartao_fora_horario: number | null
  duracao_minutos:           number | null
  observacao:                string | null
}

interface BioquimicaExame {
  id:           number
  nome:         string
  codigo:       string | null
  preco_pix:    number
  preco_cartao: number
  comissao:     number
  custo:        number | null
  ativo:        boolean
  ordem:        number
}

interface TesteRapidoExame {
  id:                number
  nome:              string
  descricao:         string | null
  material_padrao:   string | null
  metodo_padrao:     string | null
  observacao_padrao: string | null
  analitos:          string[] | null
  preco_pix:         number
  preco_cartao:      number
  comissao:          number
  ativo:             boolean
  ordem:             number
}

// PCR: mesmo formato do teste rápido + código do kit do fornecedor (migration v50).
interface PcrExame extends TesteRapidoExame {
  codigo: string | null
}

type TipoSub = 'bioquimica' | 'teste' | 'pcr'
type Aba     = 'exames' | 'bioquimica' | 'testes' | 'pcr'
type Tabela  = 'comissoes_exame' | 'bioquimica_exames' | 'testes_rapidos' | 'exames_pcr'
type Valor  = number | boolean | null

interface Pendente {
  tabela: Tabela
  id:     number
  campo:  string
  nome:   string
  antes:  Valor
  depois: Valor
}

const ABA_DA_TABELA: Record<Tabela, string> = {
  comissoes_exame:   'Exames',
  bioquimica_exames: 'Bioquímica',
  testes_rapidos:    'Teste Rápido',
  exames_pcr:        'PCR',
}

const TABELA_DA_ABA: Record<Aba, Tabela> = {
  exames:     'comissoes_exame',
  bioquimica: 'bioquimica_exames',
  testes:     'testes_rapidos',
  pcr:        'exames_pcr',
}

// Sub-itens com catálogo próprio: tabela no banco e rota da API.
const SUB: Record<TipoSub, { tabela: Tabela; api: string }> = {
  bioquimica: { tabela: 'bioquimica_exames', api: '/api/comissoes/bioquimica' },
  teste:      { tabela: 'testes_rapidos',    api: '/api/comissoes/testes-rapidos' },
  pcr:        { tabela: 'exames_pcr',        api: '/api/comissoes/pcr' },
}

const ROTULO_CAMPO: Record<string, string> = {
  preco_pix_comercial:       'Pix',
  preco_cartao_comercial:    'Cartão',
  preco_pix_fora_horario:    'Pix fora do horário',
  preco_cartao_fora_horario: 'Cartão fora do horário',
  varia_por_horario:         'Preço',
  comissao_laudo:            'Comissão laudo',
  comissao_clinica:          'Comissão clínica',
  comissao_extracao:         'Comissão extração',
  custo_exame:               'Custo',
  custo:                     'Custo',
  preco_pix:                 'Pix',
  preco_cartao:              'Cartão 3x',
  comissao:                  'Comissão clínica',
  ativo:                     'Situação',
}

function textoValor(campo: string, v: Valor): string {
  if (campo === 'ativo')             return v ? 'Ativo' : 'Inativo'
  if (campo === 'varia_por_horario') return v ? 'Varia por horário' : 'Preço único'
  if (v === null || v === undefined) return 'vazio'
  return `R$ ${fmtValor(Number(v))}`
}

// ── Estilos ───────────────────────────────────────────────────────────────────

const N = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-[#8a6e36]'
const T = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#8a6e36]'

const BENEFICIARIOS = [
  {
    campo:  'comissao_laudo',
    titulo: 'Laudo',
    quem:   'Quem gerou o laudo',
    regras: [
      'Vai para o usuário que emitiu o laudo.',
      'Só conta se o cadastro dele em Usuários estiver como "Comissão". Quem está como "Fixo" não recebe.',
    ],
    texto:  'text-blue-700', fundo: 'bg-blue-50', borda: 'border-blue-200', topo: 'border-t-blue-700',
  },
  {
    campo:  'comissao_clinica',
    titulo: 'Clínica',
    quem:   'Clínica parceira',
    regras: [
      'Vai para a clínica que coletou ou encaminhou.',
      'Se a clínica cobrou do tutor, sai descontado do repasse. Se o tutor pagou a BioPet, a BioPet fica devendo à clínica.',
      'Bioquímica, Teste Rápido e PCR: valor por sub-exame, nas abas deles.',
    ],
    texto:  'text-emerald-700', fundo: 'bg-emerald-50', borda: 'border-emerald-200', topo: 'border-t-emerald-700',
  },
  {
    campo:  'comissao_extracao',
    titulo: 'Extração',
    quem:   'Vet que extraiu o sangue',
    regras: [
      'Vai para o vet atribuído na tela Extrações.',
      'Se esse vet também é usuário do sistema, soma no mesmo saldo do laudo.',
    ],
    texto:  'text-rose-700', fundo: 'bg-rose-50', borda: 'border-rose-200', topo: 'border-t-rose-700',
  },
] as const

type CampoComissao = typeof BENEFICIARIOS[number]['campo']
const COR_CLINICA = BENEFICIARIOS[1]

// ── Pendências ────────────────────────────────────────────────────────────────

const chave = (t: Tabela, id: number, campo: string) => `${t}:${id}:${campo}`

function usePendentes() {
  const [mapa, setMapa] = useState<Record<string, Pendente>>({})

  const set = useCallback((p: Pendente) => {
    setMapa(prev => {
      const k = chave(p.tabela, p.id, p.campo)
      const antes = prev[k] ? prev[k].antes : p.antes
      const next = { ...prev }
      if ((p.depois ?? null) === (antes ?? null)) delete next[k]
      else next[k] = { ...p, antes }
      return next
    })
  }, [])

  const desfazer = useCallback((k: string) => {
    setMapa(prev => { const next = { ...prev }; delete next[k]; return next })
  }, [])

  const limparRegistro = useCallback((t: Tabela, id: number) => {
    setMapa(prev => Object.fromEntries(Object.entries(prev).filter(([, p]) => !(p.tabela === t && p.id === id))))
  }, [])

  const limpar = useCallback(() => setMapa({}), [])

  /** O registro com as edições pendentes aplicadas por cima. */
  const efetivo = useCallback(<R extends { id: number }>(t: Tabela, row: R): R => {
    let out = row
    for (const p of Object.values(mapa)) {
      if (p.tabela === t && p.id === row.id) out = { ...out, [p.campo]: p.depois }
    }
    return out
  }, [mapa])

  const pendente = useCallback((t: Tabela, id: number, campo: string) => mapa[chave(t, id, campo)], [mapa])

  return { mapa, lista: Object.values(mapa), set, desfazer, limparRegistro, limpar, efetivo, pendente }
}

type Pend = ReturnType<typeof usePendentes>

// ── Componentes pequenos ──────────────────────────────────────────────────────

function NumInput({ label, value, onChange, dica }: {
  label: string; value: string; onChange: (v: string) => void
  dica?: { texto: string; zero: boolean } | null
}) {
  return (
    <div>
      <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">{label}</label>
      <input type="text" inputMode="decimal" value={value} onChange={e => onChange(e.target.value)} className={N} />
      {dica && (
        <p className={`text-[11px] mt-1 leading-snug ${dica.zero ? 'text-red-600 font-semibold' : 'text-gray-400'}`}>{dica.texto}</p>
      )}
    </div>
  )
}

function Toggle({ on, onClick, label, pendente, disabled }: {
  on: boolean; onClick: () => void; label?: string; pendente?: boolean; disabled?: boolean
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="inline-flex items-center gap-2 text-left disabled:opacity-50"
      aria-pressed={on} aria-label={label ?? (on ? 'Ativo' : 'Inativo')}>
      <span className={`w-9 h-5 rounded-full transition relative shrink-0 ${on ? 'bg-[#c4a35a]' : 'bg-gray-200'} ${pendente ? 'ring-2 ring-amber-300 ring-offset-1' : ''}`}>
        <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${on ? 'left-4' : 'left-0.5'}`} />
      </span>
      {label && <span className="text-sm text-gray-600">{label}</span>}
    </button>
  )
}

function MarcaPendente({ p, onDesfazer }: { p?: Pendente; onDesfazer: () => void }) {
  if (!p) return null
  return (
    <button type="button" onClick={e => { e.stopPropagation(); onDesfazer() }}
      title={`Antes: ${textoValor(p.campo, p.antes)} — clique para desfazer`}
      className="text-amber-600 hover:text-amber-800 text-[11px] leading-none ml-1 shrink-0">●</button>
  )
}

type VarianteCelula = 'preco' | 'comissao' | 'custo' | 'custoBio'

/**
 * Célula editável. Clique abre o input; Enter/blur confirma (vira pendência),
 * Esc cancela.
 */
function Celula({ valor, variante, nullable, pend, onCommit, onDesfazer, vazio, cor, onInvalido }: {
  valor:      number | null
  variante:   VarianteCelula
  nullable:   boolean
  pend?:      Pendente
  onCommit:   (v: number | null) => void
  onDesfazer: () => void
  vazio?:     { valor: number; zero: boolean; motivo: string } | null
  cor?:       { texto: string; fundo: string }
  onInvalido: () => void
}) {
  const [editando, setEditando] = useState(false)
  const [texto, setTexto] = useState('')

  function abrir() { setTexto(valor == null ? '' : fmtValor(valor)); setEditando(true) }
  function confirmar() {
    const n = parseValorBR(texto)
    if (Number.isNaN(n)) { onInvalido(); setEditando(false); return }
    onCommit(n === null ? (nullable ? null : 0) : n)
    setEditando(false)
  }

  if (editando) {
    return (
      <input autoFocus value={texto} onChange={e => setTexto(e.target.value)}
        onFocus={e => e.currentTarget.select()}
        onBlur={confirmar}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); confirmar() }
          if (e.key === 'Escape') { e.preventDefault(); setEditando(false) }
        }}
        className="w-24 border border-[#8a6e36] rounded px-2 py-1 text-right text-sm focus:outline-none" inputMode="decimal" />
    )
  }

  let conteudo: React.ReactNode
  let title = 'Clique para editar'
  if (valor == null) {
    if (variante === 'preco' && vazio) {
      title = vazio.motivo
      conteudo = vazio.zero
        ? <span className="text-red-600 font-semibold">⚠ 0,00</span>
        : <span className="text-gray-400 italic">↳ {fmtValor(vazio.valor)}</span>
    } else if (variante === 'custoBio') {
      title = 'Defina o custo para ver o lucro'
      conteudo = <span className="text-[#8a6e36] font-semibold">definir</span>
    } else {
      conteudo = <span className="text-gray-300">—</span>
    }
  } else if ((variante === 'comissao' || variante === 'custo' || variante === 'custoBio') && valor === 0) {
    conteudo = <span className="text-gray-300">—</span>
  } else if (variante === 'comissao' && cor) {
    conteudo = <span className={`${cor.texto} ${cor.fundo} font-semibold rounded px-1.5 py-0.5`}>{fmtValor(valor)}</span>
  } else {
    conteudo = <span className="text-[#19202d]">{fmtValor(valor)}</span>
  }

  return (
    <div className={`inline-flex items-center justify-end rounded px-1 ${pend ? 'bg-amber-100' : ''}`}>
      <button type="button" onClick={abrir} title={title}
        className="text-right tabular-nums hover:underline decoration-dotted underline-offset-4 min-w-[3rem]">
        {conteudo}
      </button>
      <MarcaPendente p={pend} onDesfazer={onDesfazer} />
    </div>
  )
}

function Modal({ titulo, onClose, children, rodape, largura = 'max-w-xl' }: {
  titulo: string; onClose: () => void; children: React.ReactNode; rodape: React.ReactNode; largura?: string
}) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center px-4 py-6 overflow-y-auto" onClick={onClose}>
      <div className={`bg-white rounded-2xl shadow-2xl w-full ${largura} overflow-hidden my-auto`} onClick={e => e.stopPropagation()}>
        <div className="bg-[#19202d] px-6 py-4 flex items-center justify-between">
          <h3 className="text-white font-bold">{titulo}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none" aria-label="Fechar">×</button>
        </div>
        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">{children}</div>
        <div className="px-6 py-4 border-t border-gray-100 flex items-center gap-3">{rodape}</div>
      </div>
    </div>
  )
}

const SECAO = 'text-[11px] font-bold text-gray-400 uppercase tracking-wide'
const BTN_PRIMARIO = 'bg-[#19202d] hover:bg-[#232d3f] text-white font-semibold px-5 py-2.5 rounded-lg text-sm transition disabled:opacity-60'
const BTN_SECUNDARIO = 'border border-gray-200 text-gray-500 px-4 py-2.5 rounded-lg text-sm hover:bg-gray-50 transition'

// ── Formulário de exame (novo e ⋯ editar) ────────────────────────────────────

interface FormExame {
  tipo_exame:                string
  varia_por_horario:         boolean
  permite_multiplo:          boolean
  ativo:                     boolean
  preco_pix_comercial:       string
  preco_cartao_comercial:    string
  preco_pix_fora_horario:    string
  preco_cartao_fora_horario: string
  comissao_laudo:            string
  comissao_clinica:          string
  comissao_extracao:         string
  custo_exame:               string
  duracao_minutos:           string
  observacao:                string
}

const strValor = (n: number | null | undefined) => (n == null ? '' : fmtValor(Number(n)))
/** Valor do formulário: '' → null; inválido → NaN (validado no salvar). */
const lerValor = (s: string) => parseValorBR(s)

function formDe(c: Comissao): FormExame {
  return {
    tipo_exame:                c.tipo_exame,
    varia_por_horario:         Boolean(c.varia_por_horario),
    permite_multiplo:          Boolean(c.permite_multiplo),
    ativo:                     c.ativo !== false,
    preco_pix_comercial:       strValor(c.preco_pix_comercial),
    preco_cartao_comercial:    strValor(c.preco_cartao_comercial),
    preco_pix_fora_horario:    strValor(c.preco_pix_fora_horario),
    preco_cartao_fora_horario: strValor(c.preco_cartao_fora_horario),
    comissao_laudo:            strValor(c.comissao_laudo),
    comissao_clinica:          strValor(c.comissao_clinica),
    comissao_extracao:         strValor(c.comissao_extracao),
    custo_exame:               strValor(c.custo_exame),
    duracao_minutos:           c.duracao_minutos != null ? String(c.duracao_minutos) : '',
    observacao:                c.observacao ?? '',
  }
}

const FORM_VAZIO: FormExame = {
  tipo_exame: '', varia_por_horario: false, permite_multiplo: false, ativo: false,
  preco_pix_comercial: '', preco_cartao_comercial: '', preco_pix_fora_horario: '', preco_cartao_fora_horario: '',
  comissao_laudo: '', comissao_clinica: '', comissao_extracao: '', custo_exame: '', duracao_minutos: '', observacao: '',
}

/** Converte o formulário no corpo da API (null/0 conforme o campo). */
function payloadDe(f: FormExame): { ok: true; body: Record<string, unknown> } | { ok: false; erro: string } {
  const campos = ['preco_pix_comercial', 'preco_cartao_comercial', 'preco_pix_fora_horario', 'preco_cartao_fora_horario',
                  'comissao_laudo', 'comissao_clinica', 'comissao_extracao', 'custo_exame'] as const
  const v: Record<string, number | null> = {}
  for (const c of campos) {
    const n = lerValor(f[c])
    if (Number.isNaN(n)) return { ok: false, erro: `${ROTULO_CAMPO[c] ?? c}: valor inválido. Use números, ex.: 120,50` }
    v[c] = n
  }
  const pix = v.preco_pix_comercial, car = v.preco_cartao_comercial
  return {
    ok: true,
    body: {
      tipo_exame:                f.tipo_exame.trim(),
      varia_por_horario:         f.varia_por_horario,
      permite_multiplo:          f.permite_multiplo,
      ativo:                     f.ativo,
      preco_pix_comercial:       pix,
      preco_cartao_comercial:    car,
      // Sem variação, o fora do horário é gravado igual ao comercial.
      preco_pix_fora_horario:    f.varia_por_horario ? v.preco_pix_fora_horario    : pix,
      preco_cartao_fora_horario: f.varia_por_horario ? v.preco_cartao_fora_horario : car,
      comissao_laudo:            v.comissao_laudo    ?? 0,
      comissao_clinica:          v.comissao_clinica  ?? 0,
      comissao_extracao:         v.comissao_extracao ?? 0,
      custo_exame:               v.custo_exame       ?? 0,
      duracao_minutos:           f.duracao_minutos ? parseInt(f.duracao_minutos) : null,
      observacao:                f.observacao.trim() || null,
    },
  }
}

/** Linha "como ficaria" para as dicas de valor efetivo. */
function linhaDoForm(f: FormExame) {
  const n = (s: string) => { const x = lerValor(s); return Number.isNaN(x) ? null : x }
  return {
    varia_por_horario:         f.varia_por_horario,
    preco_pix_comercial:       n(f.preco_pix_comercial),
    preco_cartao_comercial:    n(f.preco_cartao_comercial),
    preco_pix_fora_horario:    n(f.preco_pix_fora_horario),
    preco_cartao_fora_horario: n(f.preco_cartao_fora_horario),
  }
}

function CamposExame({ f, set, agrupador, mostrarNome }: {
  f: FormExame
  set: <K extends keyof FormExame>(k: K, v: FormExame[K]) => void
  agrupador: boolean
  mostrarNome: boolean
}) {
  const linha = linhaDoForm(f)
  const dica = (campo: CampoPreco) => {
    const e = explicarVazio(linha, campo)
    return e ? { texto: e.zero ? `⚠ ${e.motivo}` : `↳ ${e.motivo}`, zero: e.zero } : null
  }
  const num = (s: string) => { const x = lerValor(s); return Number.isNaN(x) || x == null ? 0 : x }
  const preco    = valorEfetivo(linha, 'preco_pix_comercial')
  const comissao = num(f.comissao_laudo) + num(f.comissao_clinica) + num(f.comissao_extracao)
  const lucro    = preco - num(f.custo_exame) - comissao

  return (
    <>
      {mostrarNome && (
        <div>
          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Nome *</label>
          <input type="text" value={f.tipo_exame} onChange={e => set('tipo_exame', e.target.value)} autoFocus
            placeholder="Ex: Tomografia" className={T} />
        </div>
      )}

      {agrupador ? (
        <p className="text-sm text-gray-500 bg-gray-50 rounded-lg px-4 py-3">
          O preço e a comissão da clínica de <strong>{f.tipo_exame}</strong> são definidos por sub-exame, na aba <strong>{f.tipo_exame}</strong>.
        </p>
      ) : (
        <section className="space-y-3">
          <p className={SECAO}>Preço cobrado</p>
          <Toggle on={f.varia_por_horario} onClick={() => set('varia_por_horario', !f.varia_por_horario)}
            label="Preço diferente fora do horário comercial" />
          {f.varia_por_horario ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-blue-50 rounded-xl p-3 space-y-2">
                <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wide">Horário comercial</p>
                <NumInput label="Pix (R$)"    value={f.preco_pix_comercial}    onChange={v => set('preco_pix_comercial', v)}    dica={dica('preco_pix_comercial')} />
                <NumInput label="Cartão (R$)" value={f.preco_cartao_comercial} onChange={v => set('preco_cartao_comercial', v)} dica={dica('preco_cartao_comercial')} />
              </div>
              <div className="bg-amber-50 rounded-xl p-3 space-y-2">
                <p className="text-[10px] font-bold text-amber-700 uppercase tracking-wide">Fora do horário</p>
                <NumInput label="Pix (R$)"    value={f.preco_pix_fora_horario}    onChange={v => set('preco_pix_fora_horario', v)}    dica={dica('preco_pix_fora_horario')} />
                <NumInput label="Cartão (R$)" value={f.preco_cartao_fora_horario} onChange={v => set('preco_cartao_fora_horario', v)} dica={dica('preco_cartao_fora_horario')} />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <NumInput label="Pix (R$)"    value={f.preco_pix_comercial}    onChange={v => set('preco_pix_comercial', v)}    dica={dica('preco_pix_comercial')} />
              <NumInput label="Cartão (R$)" value={f.preco_cartao_comercial} onChange={v => set('preco_cartao_comercial', v)} dica={dica('preco_cartao_comercial')} />
            </div>
          )}
        </section>
      )}

      {!agrupador && (
        <section className="space-y-3">
          <div>
            <p className={SECAO}>Comissões — quem recebe e quanto</p>
            <p className="text-xs text-gray-400 mt-1">Deixe vazio ou 0 em quem não recebe. Um exame pode pagar mais de um.</p>
          </div>
          <div className="divide-y divide-gray-100 border border-gray-100 rounded-xl">
            {BENEFICIARIOS.map(b => (
              <div key={b.campo} className="flex items-center gap-4 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[11px] font-semibold border rounded-full px-2 py-0.5 ${b.texto} ${b.fundo} ${b.borda}`}>{b.titulo}</span>
                    <span className="text-sm font-medium text-[#19202d]">{b.quem}</span>
                  </div>
                  <p className="text-[11px] text-gray-400 mt-1 leading-snug">{b.regras[0]}</p>
                </div>
                <div className="w-28 shrink-0">
                  <input type="text" inputMode="decimal" value={f[b.campo]} onChange={e => set(b.campo, e.target.value)}
                    className={N} aria-label={`Comissão ${b.titulo} (R$)`} placeholder="0,00" />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <p className={SECAO}>Custo e lucro</p>
        <div className="grid grid-cols-2 gap-3 items-end">
          <NumInput label="Custo do exame (R$)" value={f.custo_exame} onChange={v => set('custo_exame', v)} />
          {!agrupador && (
            <div className={`rounded-lg px-3 py-2 text-right ${lucro >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Lucro BioPet (Pix)</p>
              <p className={`text-base font-bold ${lucro >= 0 ? 'text-green-700' : 'text-red-600'}`}>R$ {fmtValor(lucro)}</p>
            </div>
          )}
        </div>
        {!agrupador && (
          <p className="text-[11px] text-gray-400">
            R$ {fmtValor(preco)} (Pix, horário comercial) − R$ {fmtValor(num(f.custo_exame))} de custo − R$ {fmtValor(comissao)} de comissões.
          </p>
        )}
      </section>

      <section className="space-y-3">
        <p className={SECAO}>Agendamento</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">Duração (min)</label>
            <input type="number" min="5" value={f.duracao_minutos}
              onChange={e => set('duracao_minutos', e.target.value)} className={N} placeholder="30" />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">Observação</label>
            <input type="text" value={f.observacao}
              onChange={e => set('observacao', e.target.value)} className={T} placeholder="Ex: Jejum 12h" />
          </div>
        </div>
        <Toggle on={f.permite_multiplo} onClick={() => set('permite_multiplo', !f.permite_multiplo)}
          label="Permite marcar mais de um no mesmo agendamento" />
      </section>
    </>
  )
}

function useForm(inicial: FormExame) {
  const [f, setF] = useState<FormExame>(inicial)
  const set = <K extends keyof FormExame>(k: K, v: FormExame[K]) => setF(prev => ({ ...prev, [k]: v }))
  return { f, set }
}

// ── Modal ⋯ editar exame (salva direto) ──────────────────────────────────────

function ExameEditModal({ exame, onClose, onSaved }: {
  exame:   Comissao             // já com as pendências aplicadas
  onClose: () => void
  onSaved: (lista: Comissao[]) => void
}) {
  const { f, set } = useForm(formDe(exame))
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')
  const agrupador = ehAgrupador(exame.tipo_exame)

  const pix = lerValor(f.preco_pix_comercial)
  const bloqueiaAtivo = f.ativo && !agrupador && !(typeof pix === 'number' && pix > 0)

  async function salvar(forcarInativo = false) {
    setError('')
    if (bloqueiaAtivo && !forcarInativo) { setError(`Defina o Pix comercial de ${exame.tipo_exame} antes de ativar.`); return }
    const p = payloadDe(forcarInativo ? { ...f, ativo: false } : f)
    if (!p.ok) { setError(p.erro); return }
    setSaving(true)
    const body = agrupador
      ? { ...p.body, comissao_laudo: 0, comissao_clinica: 0, comissao_extracao: 0 }
      : p.body
    const res = await fetch('/api/comissoes', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([{ id: exame.id, ...body }]),
    })
    const data = await res.json().catch(() => ({}))
    if (res.ok) onSaved(data)
    else setError(data.error ?? 'Erro ao salvar.')
    setSaving(false)
  }

  // Desativar no lugar de apagar: o exame some do agendamento e do agente,
  // mas o histórico e os laudos continuam apontando para ele.
  async function desativar() {
    if (!confirm(`Desativar "${exame.tipo_exame}"? Ele deixa de aparecer no agendamento e para o agente. Dá para reativar depois.`)) return
    await salvar(true)
  }

  return (
    <Modal titulo={exame.tipo_exame} onClose={onClose} rodape={<>
      {!agrupador && exame.ativo && (
        <button onClick={desativar} disabled={saving} className="text-xs text-red-400 hover:text-red-600 transition mr-auto">Desativar exame</button>
      )}
      <button onClick={onClose} className={`${agrupador || !exame.ativo ? 'ml-auto' : ''} ${BTN_SECUNDARIO}`}>Cancelar</button>
      <button onClick={() => salvar()} disabled={saving} className={BTN_PRIMARIO}>{saving ? 'Salvando...' : 'Salvar'}</button>
    </>}>
      <section className="space-y-1">
        <Toggle on={f.ativo} onClick={() => set('ativo', !f.ativo)}
          label={f.ativo ? 'Ativo — aparece no agendamento e para o agente' : 'Inativo — não aparece no agendamento nem para o agente'} />
        {bloqueiaAtivo && <p className="text-xs text-red-600">Defina o Pix comercial antes de ativar.</p>}
      </section>
      <CamposExame f={f} set={set} agrupador={agrupador} mostrarNome={false} />
      {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
    </Modal>
  )
}

// ── Modal novo exame (nasce inativo) ─────────────────────────────────────────

function NovoExameModal({ onClose, onCreated }: { onClose: () => void; onCreated: (c: Comissao) => void }) {
  const { f, set } = useForm(FORM_VAZIO)
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  async function criar() {
    setError('')
    if (!f.tipo_exame.trim()) { setError('O nome é obrigatório.'); return }
    const p = payloadDe(f)
    if (!p.ok) { setError(p.erro); return }
    setSaving(true)
    const res = await fetch('/api/comissoes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...p.body, ativo: false }),
    })
    const data = await res.json().catch(() => ({}))
    if (res.ok) onCreated(data)
    else setError(data.error ?? 'Erro ao criar.')
    setSaving(false)
  }

  return (
    <Modal titulo="Novo exame" onClose={onClose} rodape={<>
      <button onClick={onClose} className={`ml-auto ${BTN_SECUNDARIO}`}>Cancelar</button>
      <button onClick={criar} disabled={saving} className={BTN_PRIMARIO}>{saving ? 'Criando...' : 'Criar inativo'}</button>
    </>}>
      <CamposExame f={f} set={set} agrupador={false} mostrarNome />
      <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-4 py-3">
        O exame é criado <strong>inativo</strong>: não aparece no agendamento nem para o agente até você ligar &quot;Ativo&quot;.
      </p>
      {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
    </Modal>
  )
}

// ── Modais novo sub-exame / novo teste (nascem inativos) ─────────────────────

function NovoSubModal({ tipo, nextOrdem, onClose, onCreated }: {
  tipo: TipoSub; nextOrdem: number; onClose: () => void; onCreated: () => void
}) {
  const [nome,      setNome]      = useState('')
  const [extra,     setExtra]     = useState('')   // código (bioquímica/PCR) ou subtítulo (teste)
  const [pix,       setPix]       = useState('')
  const [cartao,    setCartao]    = useState('')
  const [custo,     setCusto]     = useState('')
  const [comissao,  setComissao]  = useState('')
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState('')
  const bio = tipo === 'bioquimica'
  const pcr = tipo === 'pcr'

  async function criar() {
    setError('')
    if (!nome.trim()) { setError('O nome é obrigatório.'); return }
    const vals = { pix: lerValor(pix), cartao: lerValor(cartao), custo: lerValor(custo), comissao: lerValor(comissao) }
    if (Object.values(vals).some(v => Number.isNaN(v))) { setError('Valor inválido. Use números, ex.: 120,50'); return }
    setSaving(true)
    const body = bio
      ? { nome: nome.trim(), codigo: extra.trim() || null, preco_pix: vals.pix ?? 0, preco_cartao: vals.cartao,
          custo: vals.custo, comissao: vals.comissao ?? 0, ordem: nextOrdem, ativo: false }
      : pcr
      ? { nome: nome.trim(), codigo: extra.trim() || null, metodo_padrao: 'PCR', preco_pix: vals.pix ?? 0,
          preco_cartao: vals.cartao, comissao: vals.comissao ?? 0, ordem: nextOrdem, ativo: false }
      : { nome: nome.trim(), descricao: extra.trim() || null, preco_pix: vals.pix ?? 0, preco_cartao: vals.cartao,
          comissao: vals.comissao ?? 0, ordem: nextOrdem, ativo: false }
    const res = await fetch(SUB[tipo].api, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    const data = await res.json().catch(() => ({}))
    if (res.ok) onCreated()
    else setError(data.error ?? 'Erro ao criar.')
    setSaving(false)
  }

  const pixN = lerValor(pix)
  return (
    <Modal titulo={bio ? 'Novo sub-exame de Bioquímica' : pcr ? 'Novo exame de PCR' : 'Novo teste rápido'} largura="max-w-md" onClose={onClose} rodape={<>
      <button onClick={onClose} className={`ml-auto ${BTN_SECUNDARIO}`}>Cancelar</button>
      <button onClick={criar} disabled={saving} className={BTN_PRIMARIO}>{saving ? 'Criando...' : 'Criar inativo'}</button>
    </>}>
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Nome *</label>
          <input type="text" value={nome} onChange={e => setNome(e.target.value)} autoFocus className={T}
            placeholder={bio ? 'Ex: TGP (ALT)' : pcr ? 'Ex: Ehrlichia spp.' : 'Ex: Snap 4Dx Plus'} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
            {bio ? 'Código (opcional)' : pcr ? 'Código do kit (opcional)' : 'Subtítulo (opcional)'}
          </label>
          <input type="text" value={extra} onChange={e => setExtra(e.target.value)} className={T}
            placeholder={bio ? 'Ex: TGP' : pcr ? 'Ex: PC08-0' : 'Ex: Anticorpos IgG'} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <NumInput label="Pix (R$)" value={pix} onChange={setPix} />
          <NumInput label="Cartão 3x (R$)" value={cartao} onChange={setCartao}
            dica={cartao.trim() === '' ? { texto: `↳ Vazio: usa o Pix (R$ ${fmtValor(typeof pixN === 'number' ? pixN : 0)}).`, zero: false } : null} />
          {bio && <NumInput label="Custo (R$)" value={custo} onChange={setCusto} />}
          <NumInput label="Comissão clínica (R$)" value={comissao} onChange={setComissao} />
        </div>
        {!bio && <p className="text-[11px] text-gray-400">{pcr ? 'Subtítulo, material' : 'Material'}, método, agentes e observação ficam no ✏️ Editar, depois de criar.</p>}
        <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-4 py-3">
          Criado <strong>inativo</strong>: não aparece no agendamento até você ligar &quot;Ativo&quot;.
        </p>
        {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
      </div>
    </Modal>
  )
}

// ── Modal de edição de um teste rápido (nome, subtítulo, material, método, observação) ──

function TesteRapidoEditModal({ teste, tipo = 'teste', onClose, onSaved }: {
  teste:   TesteRapidoExame | PcrExame
  tipo?:   'teste' | 'pcr'
  onClose: () => void
  onSaved: (t: TesteRapidoExame) => void
}) {
  const pcr = tipo === 'pcr'
  const [nome,      setNome]      = useState(teste.nome)
  const [codigo,    setCodigo]    = useState((teste as PcrExame).codigo ?? '')
  const [descricao, setDescricao] = useState(teste.descricao ?? '')
  const [material,  setMaterial]  = useState(teste.material_padrao ?? '')
  const [metodo,    setMetodo]    = useState(teste.metodo_padrao ?? '')
  const [obs,       setObs]       = useState(teste.observacao_padrao ?? '')
  const [agentes,   setAgentes]   = useState((teste.analitos ?? []).join('\n'))
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState('')

  async function handleSave() {
    if (!nome.trim()) { setError('O nome é obrigatório.'); return }
    setSaving(true); setError('')
    const analitos = agentes.split('\n').map(a => a.trim()).filter(Boolean)
    const res = await fetch(`${SUB[tipo].api}/${teste.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nome:              nome.trim(),
        ...(pcr ? { codigo: codigo.trim() || null } : {}),
        descricao:         descricao.trim() || null,
        material_padrao:   material.trim() || null,
        metodo_padrao:     metodo.trim() || null,
        observacao_padrao: obs.trim() || null,
        analitos:          analitos.length > 0 ? analitos : null,
      }),
    })
    if (res.ok) {
      onSaved(await res.json())
    } else {
      const d = await res.json().catch(() => ({}))
      setError(d.error ?? 'Erro ao salvar.')
    }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center px-4 py-6 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden my-auto" onClick={e => e.stopPropagation()}>
        <div className="bg-[#19202d] px-6 py-4 flex items-center justify-between">
          <h3 className="text-white font-bold text-sm">{pcr ? 'Editar exame de PCR' : 'Editar teste rápido'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none">×</button>
        </div>
        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          <div className={pcr ? 'grid grid-cols-[1fr_9rem] gap-3' : ''}>
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Nome *</label>
              <input type="text" value={nome} onChange={e => setNome(e.target.value)} className={T}
                placeholder={pcr ? 'Ex: Ehrlichia spp.' : 'Ex: Snap 4Dx Plus'} />
            </div>
            {pcr && (
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Código do kit</label>
                <input type="text" value={codigo} onChange={e => setCodigo(e.target.value)} className={T} placeholder="Ex: PC08-0" />
              </div>
            )}
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Subtítulo (aparece abaixo do nome no laudo)</label>
            <input type="text" value={descricao} onChange={e => setDescricao(e.target.value)} className={T} placeholder="Ex: Anticorpos IgG" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Material padrão</label>
              <input type="text" value={material} onChange={e => setMaterial(e.target.value)} className={T} placeholder="Ex: Soro, Sangue total" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Método padrão</label>
              <input type="text" value={metodo} onChange={e => setMetodo(e.target.value)} className={T}
                placeholder={pcr ? 'Ex: PCR em tempo real' : 'Ex: Imunocromatografia'} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">{pcr ? 'Agentes (painel)' : 'Agentes (teste combo)'}</label>
            <textarea value={agentes} onChange={e => setAgentes(e.target.value)} rows={4}
              className={T + ' resize-none text-xs leading-relaxed'}
              placeholder={'Um agente por linha. Ex.:\nEhrlichia spp.\nAnaplasma spp.'} />
            <p className="text-[11px] text-gray-400 mt-1">
              {pcr
                ? <>Para painéis que detectam <strong>vários agentes</strong> (ex.: Doenças do Carrapato, FIV e FeLV): um por linha.</>
                : <>Para testes que detectam <strong>vários agentes</strong> (ex.: 4Dx, FIV/FeLV): um por linha.</>} Na emissão o resultado é marcado Positivo/Negativo por agente. <strong>Deixe em branco</strong> para teste de resultado único.
            </p>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Observação padrão (bloco de observações do laudo)</label>
            <textarea value={obs} onChange={e => setObs(e.target.value)} rows={9}
              className={T + ' resize-none font-mono text-xs leading-relaxed'}
              placeholder="Texto que já vem preenchido quando este teste é incluído no laudo." />
            <p className="text-[11px] text-gray-400 mt-1">
              Deixe uma <strong>linha em branco</strong> entre os parágrafos para que apareçam separados no laudo. É editável na hora de emitir cada laudo.
            </p>
          </div>
          {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
          <button onClick={onClose} className="flex-1 border border-gray-200 text-gray-500 py-2.5 rounded-lg text-sm hover:bg-gray-50 transition">Cancelar</button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 bg-[#19202d] hover:bg-[#232d3f] text-white font-semibold py-2.5 rounded-lg text-sm transition disabled:opacity-60">
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Aba Exames ───────────────────────────────────────────────────────────────

function QuadroBeneficiarios() {
  return (
    <div className="bg-white rounded-xl border shadow-sm p-4 space-y-3">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <p className="text-sm font-bold text-[#19202d]">Quem recebe comissão</p>
        <p className="text-[11px] text-gray-400">Um exame pode pagar mais de um. &quot;—&quot; = não recebe.</p>
      </div>
      <div className="grid md:grid-cols-3 gap-3">
        {BENEFICIARIOS.map(b => (
          <div key={b.campo} className={`rounded-lg border ${b.borda} border-t-[3px] ${b.topo} ${b.fundo} p-3 space-y-1.5`}>
            <div className="flex items-center gap-2">
              <span className={`text-[11px] font-bold rounded-full px-2 py-0.5 bg-white ${b.texto}`}>{b.titulo}</span>
              <span className={`text-sm font-semibold ${b.texto}`}>{b.quem}</span>
            </div>
            {b.regras.map(r => <p key={r} className="text-xs text-gray-600 leading-snug">{r}</p>)}
          </div>
        ))}
      </div>
      <p className="text-[11px] text-gray-400">
        O valor fica gravado no agendamento e no laudo quando são feitos. Mudar a tabela não altera o que já foi feito.
      </p>
    </div>
  )
}

function AlertaZero({ exames, onCorrigir }: { exames: { exame: Comissao; combos: string[] }[]; onCorrigir: (c: Comissao) => void }) {
  if (exames.length === 0) return null
  const n = exames.length
  return (
    <div className="bg-red-50 border border-red-200 border-l-4 border-l-red-600 rounded-xl px-5 py-4 space-y-3">
      <div>
        <p className="text-sm font-bold text-red-700">
          {n} exame{n > 1 ? 's' : ''} ativo{n > 1 ? 's' : ''} cobra{n > 1 ? 'm' : ''} R$ 0,00 por campo vazio
        </p>
        <p className="text-xs text-red-600 mt-0.5">Com &quot;Varia por horário&quot; ligado, o cartão vazio não usa o Pix: cobra zero.</p>
      </div>
      <ul className="space-y-2">
        {exames.map(({ exame, combos }) => (
          <li key={exame.id} className="bg-white rounded-lg border border-red-100 px-3 py-2 flex items-center justify-between gap-3">
            <span className="text-sm">
              <strong className="text-red-800">{exame.tipo_exame}</strong>
              <span className="text-gray-500"> · {combos.join(', ')}</span>
            </span>
            <button onClick={() => onCorrigir(exame)}
              className="bg-red-600 hover:bg-red-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg shrink-0">Corrigir</button>
          </li>
        ))}
      </ul>
    </div>
  )
}

function TabelaExames({ exames, pend, destacados, onEditar, onAbrirAba, toast }: {
  exames:     Comissao[]
  pend:       Pend
  destacados: Set<string>
  onEditar:   (c: Comissao) => void
  onAbrirAba: (a: Aba) => void
  toast:      (msg: string) => void
}) {
  const TAB: Tabela = 'comissoes_exame'
  const invalido = () => toast('Valor inválido. Use números, ex.: 120,50')

  const th = 'px-3 py-2 text-[10px] font-bold uppercase tracking-wide'
  return (
    <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
      <div className="h-1 bg-gold-stripe" />
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[980px]">
          <thead>
            <tr className="bg-gray-50 text-gray-400">
              <th className={th} />
              <th className={`${th} text-center border-b border-gray-200`} colSpan={2}>Preço (R$)</th>
              <th className={`${th} text-center border-b border-gray-200`} colSpan={3}>Comissões (R$)</th>
              <th className={th} colSpan={4} />
            </tr>
            <tr className="bg-gray-50 border-b border-gray-100 text-gray-400">
              <th className={`${th} text-left`}>Exame</th>
              <th className={`${th} text-right`}>Pix</th>
              <th className={`${th} text-right`}>Cartão</th>
              {BENEFICIARIOS.map(b => <th key={b.campo} className={`${th} text-right ${b.texto}`}>{b.titulo}</th>)}
              <th className={`${th} text-right`}>Custo</th>
              <th className={`${th} text-right`}>Lucro</th>
              <th className={`${th} text-center`}>Ativo</th>
              <th className={th} />
            </tr>
          </thead>
          <tbody>
            {exames.map(original => {
              const c = pend.efetivo(TAB, original)
              const agrupador = ehAgrupador(c.tipo_exame)
              const destaque  = destacados.has(`${TAB}:${c.id}`)
              const p = (campo: string) => pend.pendente(TAB, c.id, campo)
              const desfazer = (campo: string) => () => pend.desfazer(chave(TAB, c.id, campo))
              const commit = (campo: keyof Comissao) => (v: Valor) =>
                pend.set({ tabela: TAB, id: c.id, campo, nome: c.tipo_exame, antes: original[campo] as Valor, depois: v })
              const linha = { ...c, varia_por_horario: Boolean(c.varia_por_horario) }
              const celPreco = (campo: CampoPreco) => (
                <Celula valor={c[campo]} variante="preco" nullable pend={p(campo)} onDesfazer={desfazer(campo)}
                  onCommit={commit(campo)} vazio={explicarVazio(linha, campo)} onInvalido={invalido} />
              )
              const lucro = valorEfetivo(linha, 'preco_pix_comercial') - Number(c.custo_exame ?? 0)
                - Number(c.comissao_laudo ?? 0) - Number(c.comissao_clinica ?? 0) - Number(c.comissao_extracao ?? 0)
              const pAtivo = p('ativo'), pVaria = p('varia_por_horario')

              function alternarAtivo() {
                if (!c.ativo && !podeAtivar(c)) { toast(`Defina o Pix comercial de ${c.tipo_exame} antes de ativar.`); return }
                commit('ativo')(!c.ativo)
              }

              const bg = destaque ? 'bg-green-50' : ''
              return (
                <FragmentoLinhas key={c.id}>
                  <tr className={`border-t border-gray-100 align-top transition-colors ${bg}`}>
                    <td className="px-3 py-2.5">
                      <div className="font-medium text-[#19202d]">{c.tipo_exame}</div>
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        {!agrupador && (
                          <button type="button" onClick={() => commit('varia_por_horario')(!c.varia_por_horario)}
                            title="Clique para alternar"
                            className={`text-[10px] font-semibold rounded-full px-2 py-0.5 border ${
                              c.varia_por_horario ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-gray-50 text-gray-500 border-gray-200'
                            } ${pVaria ? 'ring-2 ring-amber-300' : ''}`}>
                            {c.varia_por_horario ? 'Varia por horário' : 'Preço único'}
                          </button>
                        )}
                        <MarcaPendente p={pVaria} onDesfazer={desfazer('varia_por_horario')} />
                        {!c.ativo && <span className="text-[10px] font-semibold rounded-full px-2 py-0.5 bg-gray-200 text-gray-600">Inativo</span>}
                      </div>
                    </td>

                    {agrupador ? (
                      <td colSpan={5} className="px-3 py-2.5">
                        <button type="button" onClick={() => onAbrirAba(c.tipo_exame === 'Bioquímica' ? 'bioquimica' : c.tipo_exame === 'PCR' ? 'pcr' : 'testes')}
                          className="w-full border border-dashed border-gray-300 rounded-lg px-3 py-2 text-xs text-gray-500 hover:border-[#8a6e36] hover:text-[#8a6e36] transition">
                          Preço e comissão da clínica por sub-exame · abrir aba {c.tipo_exame} →
                        </button>
                      </td>
                    ) : (
                      <>
                        <td className="px-3 py-2.5 text-right">{celPreco('preco_pix_comercial')}</td>
                        <td className="px-3 py-2.5 text-right">{celPreco('preco_cartao_comercial')}</td>
                        {BENEFICIARIOS.map(b => (
                          <td key={b.campo} className="px-3 py-2.5 text-right">
                            <Celula valor={Number(c[b.campo] ?? 0)} variante="comissao" nullable={false} pend={p(b.campo)}
                              onDesfazer={desfazer(b.campo)} onCommit={commit(b.campo)} cor={b} onInvalido={invalido} />
                          </td>
                        ))}
                      </>
                    )}

                    <td className="px-3 py-2.5 text-right">
                      <Celula valor={Number(c.custo_exame ?? 0)} variante="custo" nullable={false} pend={p('custo_exame')}
                        onDesfazer={desfazer('custo_exame')} onCommit={commit('custo_exame')} onInvalido={invalido} />
                    </td>
                    <td className={`px-3 py-2.5 text-right font-semibold tabular-nums ${agrupador ? 'text-gray-300' : lucro >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                      {agrupador ? '—' : fmtValor(lucro)}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <div className="inline-flex items-center">
                        <Toggle on={c.ativo} onClick={alternarAtivo} pendente={Boolean(pAtivo)} />
                        <MarcaPendente p={pAtivo} onDesfazer={desfazer('ativo')} />
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <button type="button" onClick={() => onEditar(c)} title="Editar tudo (duração, observação...)"
                        className="text-gray-400 hover:text-[#8a6e36] px-1.5 text-lg leading-none" aria-label={`Editar ${c.tipo_exame}`}>⋯</button>
                    </td>
                  </tr>

                  {!agrupador && c.varia_por_horario && (
                    <tr className={`align-top ${bg}`}>
                      <td className="px-3 pb-2.5 pt-0">
                        <div className="border-l-2 border-amber-400 pl-2">
                          <span className="text-xs font-semibold text-amber-700">Fora do horário</span>
                          <span className="text-[11px] text-gray-400"> · Demais horários e feriados</span>
                        </div>
                      </td>
                      <td className="px-3 pb-2.5 pt-0 text-right">{celPreco('preco_pix_fora_horario')}</td>
                      <td className="px-3 pb-2.5 pt-0 text-right">{celPreco('preco_cartao_fora_horario')}</td>
                      <td colSpan={7} />
                    </tr>
                  )}
                </FragmentoLinhas>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="px-4 py-3 border-t border-gray-100 bg-gray-50 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-gray-500">
        <span><span className="text-gray-400 italic">↳</span> campo vazio, cobra outro preço</span>
        <span><span className="text-red-600 font-semibold">⚠ 0,00</span> campo vazio, cobra zero</span>
        <span><span className="text-amber-600">●</span> alterado, ainda não salvo</span>
        <span>Lucro = Pix comercial − custo − comissões</span>
      </div>
    </div>
  )
}

function FragmentoLinhas({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

// ── Abas Bioquímica e Teste Rápido ───────────────────────────────────────────

function TabelaSub({ tipo, itens, pend, destacados, onReordenar, onEditarTeste, toast }: {
  tipo:          TipoSub
  itens:         (BioquimicaExame | TesteRapidoExame | PcrExame)[]
  pend:          Pend
  destacados:    Set<string>
  onReordenar:   (a: { id: number; ordem: number }, b: { id: number; ordem: number }) => void
  onEditarTeste: (t: TesteRapidoExame) => void
  toast:         (msg: string) => void
}) {
  const bio = tipo === 'bioquimica'
  const TAB: Tabela = SUB[tipo].tabela
  const invalido = () => toast('Valor inválido. Use números, ex.: 120,50')
  const th = 'px-3 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wide'

  const efetivos = itens.map(i => pend.efetivo(TAB, i))
  const semCusto = bio ? efetivos.filter(e => e.ativo && (e as BioquimicaExame).custo == null).length : 0

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        {bio
          ? 'Preço, custo e comissão da clínica de cada sub-exame. Clique num valor para editar.'
          : `Preço e comissão da clínica de cada ${tipo === 'pcr' ? 'PCR' : 'teste'}. Clique num valor para editar. O custo virá do estoque.`}
      </p>
      {semCusto > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
          {semCusto} sub-exame{semCusto > 1 ? 's' : ''} ativo{semCusto > 1 ? 's' : ''} sem custo: o lucro não aparece até você definir.
        </div>
      )}
      {itens.length === 0 ? (
        <div className="bg-white rounded-xl border shadow-sm p-10 text-center text-gray-400 text-sm">Nada cadastrado.</div>
      ) : (
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
          <div className="h-1 bg-gold-stripe" />
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[760px]">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className={`${th} text-left`}>{bio ? 'Sub-exame' : tipo === 'pcr' ? 'Exame' : 'Teste'}</th>
                  <th className={`${th} text-right`}>Pix</th>
                  <th className={`${th} text-right`}>Cartão 3x</th>
                  {bio && <th className={`${th} text-right`}>Custo</th>}
                  <th className={`${th} text-right ${COR_CLINICA.texto}`}>Comissão clínica</th>
                  {bio && <th className={`${th} text-right`}>Lucro Pix</th>}
                  <th className={`${th} text-center`}>Ativo</th>
                  <th className={`${th} text-center`}>Ordem</th>
                  <th className={th} />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {itens.map((original, i) => {
                  const e = efetivos[i]
                  const p = (campo: string) => pend.pendente(TAB, e.id, campo)
                  const desfazer = (campo: string) => () => pend.desfazer(chave(TAB, e.id, campo))
                  const commit = (campo: string) => (v: Valor) =>
                    pend.set({ tabela: TAB, id: e.id, campo, nome: e.nome, antes: (original as unknown as Record<string, Valor>)[campo] ?? null, depois: v })
                  const custo = bio ? (e as BioquimicaExame).custo : null
                  const lucro = custo == null ? null : Number(e.preco_pix) - Number(custo) - Number(e.comissao)
                  const pAtivo = p('ativo')
                  const codigo = 'codigo' in e ? e.codigo : null

                  return (
                    <tr key={e.id} className={`transition-colors ${!e.ativo ? 'opacity-60' : ''} ${destacados.has(`${TAB}:${e.id}`) ? 'bg-green-50' : ''}`}>
                      <td className="px-3 py-2.5">
                        <div className="font-medium text-[#19202d]">
                          {codigo && <span className="font-mono text-xs text-gray-400 mr-2">{codigo}</span>}
                          {e.nome}
                        </div>
                        {!bio && (e as TesteRapidoExame).descricao && <div className="text-[11px] text-gray-400">{(e as TesteRapidoExame).descricao}</div>}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <Celula valor={Number(e.preco_pix)} variante="preco" nullable={false} pend={p('preco_pix')}
                          onDesfazer={desfazer('preco_pix')} onCommit={commit('preco_pix')} onInvalido={invalido} />
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <Celula valor={Number(e.preco_cartao)} variante="preco" nullable={false} pend={p('preco_cartao')}
                          onDesfazer={desfazer('preco_cartao')} onCommit={commit('preco_cartao')} onInvalido={invalido} />
                      </td>
                      {bio && (
                        <td className="px-3 py-2.5 text-right">
                          <Celula valor={custo} variante="custoBio" nullable pend={p('custo')}
                            onDesfazer={desfazer('custo')} onCommit={commit('custo')} onInvalido={invalido} />
                        </td>
                      )}
                      <td className="px-3 py-2.5 text-right">
                        <Celula valor={Number(e.comissao)} variante="comissao" nullable={false} pend={p('comissao')} cor={COR_CLINICA}
                          onDesfazer={desfazer('comissao')} onCommit={commit('comissao')} onInvalido={invalido} />
                      </td>
                      {bio && (
                        <td className={`px-3 py-2.5 text-right font-semibold tabular-nums ${lucro == null ? 'text-gray-300' : lucro >= 0 ? 'text-green-700' : 'text-red-600'}`}
                          title={lucro == null ? 'Defina o custo' : undefined}>
                          {lucro == null ? '—' : fmtValor(lucro)}
                        </td>
                      )}
                      <td className="px-3 py-2.5 text-center">
                        <div className="inline-flex items-center">
                          <Toggle on={e.ativo} onClick={() => commit('ativo')(!e.ativo)} pendente={Boolean(pAtivo)} />
                          <MarcaPendente p={pAtivo} onDesfazer={desfazer('ativo')} />
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => i > 0 && onReordenar(itens[i], itens[i - 1])} disabled={i === 0}
                            className="text-gray-400 hover:text-[#8a6e36] disabled:opacity-20 transition text-base leading-none px-1" title="Mover para cima">↑</button>
                          <button onClick={() => i < itens.length - 1 && onReordenar(itens[i], itens[i + 1])} disabled={i === itens.length - 1}
                            className="text-gray-400 hover:text-[#8a6e36] disabled:opacity-20 transition text-base leading-none px-1" title="Mover para baixo">↓</button>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">
                        {!bio && (
                          <button onClick={() => onEditarTeste(original as TesteRapidoExame)}
                            className="text-xs text-[#8a6e36] hover:text-[#5a4a28] transition px-1.5 py-1 font-semibold"
                            title={`Editar nome${tipo === 'pcr' ? ', código' : ''}, material, método, agentes e observações`}>✏️ Editar</button>
                        )}
                        {e.ativo && (
                          <button onClick={() => { commit('ativo')(false); toast(`${e.nome} marcado para desativar. Confirme em "Revisar e salvar".`) }}
                            className="text-xs text-red-400 hover:text-red-600 transition p-1 ml-1" title="Desativar">✕</button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 border-t border-gray-100 bg-gray-50 text-[11px] text-gray-500">
            A ordem (↑↓) salva na hora. Os demais valores ficam pendentes (<span className="text-amber-600">●</span>) até &quot;Revisar e salvar&quot;.
          </div>
        </div>
      )}
    </div>
  )
}

// ── Revisão das alterações ────────────────────────────────────────────────────

function RevisaoModal({ pend, exames, onClose, onSalvo }: {
  pend:    Pend
  exames:  Comissao[]
  onClose: () => void
  onSalvo: (n: number, registros: string[]) => void
}) {
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  const grupos = useMemo(() => {
    const m = new Map<string, Pendente[]>()
    for (const p of pend.lista) {
      const k = `${p.tabela}:${p.id}`
      m.set(k, [...(m.get(k) ?? []), p])
    }
    return Array.from(m.entries())
  }, [pend.lista])

  async function confirmar() {
    setError('')
    // Exame ativo precisa de Pix comercial (a API confere de novo).
    for (const ex of exames) {
      if (!pend.lista.some(p => p.tabela === 'comissoes_exame' && p.id === ex.id)) continue
      const e = pend.efetivo('comissoes_exame', ex)
      if (e.ativo && !podeAtivar(e)) {
        setError(`${e.tipo_exame}: exame ativo precisa do Pix comercial. Defina o valor ou desative.`)
        return
      }
    }
    setSaving(true)
    try {
      const res = await fetch('/api/comissoes/alteracoes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alteracoes: pend.lista.map(p => ({ tabela: p.tabela, id: p.id, campo: p.campo, antes: p.antes, depois: p.depois })) }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error
          ? `${data.error} Nada foi perdido: as alterações continuam pendentes.`
          : 'Não foi possível salvar. Nada foi perdido: as alterações continuam pendentes.')
        return
      }
      onSalvo(pend.lista.length, grupos.map(([k]) => k))
    } catch {
      setError('Não foi possível salvar. Nada foi perdido: as alterações continuam pendentes.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal titulo="Confirmar alterações" largura="max-w-2xl" onClose={onClose} rodape={<>
      <span className="text-[11px] text-gray-400 mr-auto">Fica registrado quem alterou e quando.</span>
      <button onClick={onClose} className={BTN_SECUNDARIO}>Voltar</button>
      <button onClick={confirmar} disabled={saving || pend.lista.length === 0} className={BTN_PRIMARIO}>
        {saving ? 'Salvando...' : 'Confirmar e salvar'}
      </button>
    </>}>
      {grupos.length === 0 && <p className="text-sm text-gray-400">Nenhuma alteração pendente.</p>}
      <div className="space-y-4">
        {grupos.map(([k, itens]) => (
          <div key={k} className="border border-gray-100 rounded-xl overflow-hidden">
            <div className="bg-gray-50 px-4 py-2 flex items-center justify-between">
              <span className="font-semibold text-sm text-[#19202d]">{itens[0].nome}</span>
              <span className="text-[11px] text-gray-400">{ABA_DA_TABELA[itens[0].tabela]}</span>
            </div>
            <ul className="divide-y divide-gray-50">
              {itens.map(p => (
                <li key={p.campo} className="px-4 py-2 flex items-center gap-3 text-sm">
                  <span className="text-gray-500 w-40 shrink-0">{ROTULO_CAMPO[p.campo] ?? p.campo}</span>
                  <span className="text-gray-400 line-through">{textoValor(p.campo, p.antes)}</span>
                  <span className="text-gray-400">→</span>
                  <span className="font-semibold text-[#19202d]">{textoValor(p.campo, p.depois)}</span>
                  <button onClick={() => pend.desfazer(chave(p.tabela, p.id, p.campo))}
                    className="ml-auto text-xs text-[#8a6e36] hover:underline">Desfazer</button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
    </Modal>
  )
}

// ── Página ────────────────────────────────────────────────────────────────────

export default function ComissoesPage() {
  const [aba,        setAba]        = useState<Aba>('exames')
  const [exames,     setExames]     = useState<Comissao[]>([])
  const [bios,       setBios]       = useState<BioquimicaExame[]>([])
  const [testes,     setTestes]     = useState<TesteRapidoExame[]>([])
  const [pcrs,       setPcrs]       = useState<PcrExame[]>([])
  const [loading,    setLoading]    = useState(true)
  const [busca,      setBusca]      = useState('')
  const [editando,   setEditando]   = useState<Comissao | null>(null)
  const [editTeste,  setEditTeste]  = useState<TesteRapidoExame | null>(null)
  const [editPcr,    setEditPcr]    = useState<PcrExame | null>(null)
  const [novo,       setNovo]       = useState<Aba | null>(null)
  const [revisando,  setRevisando]  = useState(false)
  const [toastMsg,   setToastMsg]   = useState('')
  const [destacados, setDestacados] = useState<Set<string>>(new Set())
  const pend = usePendentes()

  const toast = useCallback((msg: string) => {
    setToastMsg(msg)
    window.setTimeout(() => setToastMsg(m => (m === msg ? '' : m)), 3500)
  }, [])

  const carregar = useCallback(async () => {
    const [r1, r2, r3, r4] = await Promise.all([
      fetch('/api/comissoes'), fetch(SUB.bioquimica.api), fetch(SUB.teste.api), fetch(SUB.pcr.api),
    ])
    if (r1.ok) setExames(await r1.json())
    if (r2.ok) setBios(await r2.json())
    if (r3.ok) setTestes(await r3.json())
    if (r4.ok) setPcrs(await r4.json())
    setLoading(false)
  }, [])

  useEffect(() => { carregar() }, [carregar])

  // Aviso ao sair com alterações não salvas.
  useEffect(() => {
    if (pend.lista.length === 0) return
    const aviso = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', aviso)
    return () => window.removeEventListener('beforeunload', aviso)
  }, [pend.lista.length])

  function destacar(registros: string[]) {
    setDestacados(new Set(registros))
    window.setTimeout(() => setDestacados(new Set()), 3000)
  }

  // Ordem salva na hora (como sempre foi): troca a ordem dos dois itens.
  async function reordenar(tipo: TipoSub, a: { id: number; ordem: number }, b: { id: number; ordem: number }) {
    const patch = (id: number, ordem: number) => fetch(`${SUB[tipo].api}/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ordem }),
    })
    await Promise.all([patch(a.id, b.ordem), patch(b.id, a.ordem)])
    await carregar()
  }

  const examesEfetivos = exames.map(e => pend.efetivo('comissoes_exame', e))
  const zerados = examesEfetivos
    .filter(e => e.ativo && !ehAgrupador(e.tipo_exame))
    .map(e => ({ exame: e, combos: combinacoesZeradas({ ...e, varia_por_horario: Boolean(e.varia_por_horario) }).map(c => c.rotulo) }))
    .filter(x => x.combos.length > 0)

  const termo = busca.trim().toLowerCase()
  const examesVisiveis = exames.filter(e => !termo || e.tipo_exame.toLowerCase().includes(termo))

  const ROTULO_NOVO: Record<Aba, string> = { exames: '+ Novo exame', bioquimica: '+ Novo sub-exame', testes: '+ Novo teste', pcr: '+ Novo PCR' }
  const TIPO_DA_ABA: Partial<Record<Aba, TipoSub>> = { bioquimica: 'bioquimica', testes: 'teste', pcr: 'pcr' }
  const ITENS_DO_TIPO: Record<TipoSub, { ordem: number }[]> = { bioquimica: bios, teste: testes, pcr: pcrs }
  const tipoNovo = novo ? TIPO_DA_ABA[novo] : undefined
  const nPend = pend.lista.length

  return (
    <div className="min-h-screen bg-gray-50">
      <main className={`max-w-6xl mx-auto px-4 space-y-6 ${nPend > 0 ? 'pb-28' : 'pb-8'}`}>

        {/* Header escuro (igual ao Dashboard) */}
        <div className="bg-[#19202d] -mx-4 px-4 pt-6 pb-4 rounded-b-2xl flex flex-col gap-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h1 className="text-white text-xl font-extrabold">Preços e Comissões</h1>
              <p className="text-gray-400 text-xs mt-0.5">Preço cobrado, quem recebe comissão e quanto sobra para a BioPet.</p>
            </div>
            <button onClick={() => setNovo(aba)}
              className="bg-[#c4a35a] hover:bg-[#d4b46a] text-[#19202d] font-bold px-4 py-2 rounded-lg text-sm transition">
              {ROTULO_NOVO[aba]}
            </button>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {([
              { key: 'exames',     label: 'Exames' },
              { key: 'bioquimica', label: '🧪 Bioquímica' },
              { key: 'testes',     label: '💉 Teste Rápido' },
              { key: 'pcr',        label: '🧬 PCR' },
            ] as const).map(t => {
              const n = pend.lista.filter(p => p.tabela === TABELA_DA_ABA[t.key]).length
              return (
                <button key={t.key} onClick={() => setAba(t.key)}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition ${aba === t.key ? 'bg-white text-[#19202d]' : 'bg-white/10 text-gray-300 hover:bg-white/15'}`}>
                  {t.label}{n > 0 && <span className="ml-1.5 text-amber-500">●{n}</span>}
                </button>
              )
            })}
          </div>
        </div>

        {loading ? (
          <div className="text-center py-16 text-gray-400">Carregando...</div>
        ) : aba === 'exames' ? (
          <div className="space-y-5">
            <AlertaZero exames={zerados} onCorrigir={setEditando} />
            <QuadroBeneficiarios />
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-sm text-gray-500">Clique num valor para editar (Esc desfaz). Nada é salvo até você revisar e confirmar. ⋯ abre os detalhes.</p>
              <input type="search" value={busca} onChange={e => setBusca(e.target.value)}
                placeholder="Buscar exame..." className={T + ' sm:max-w-xs bg-white'} />
            </div>
            <TabelaExames exames={examesVisiveis} pend={pend} destacados={destacados}
              onEditar={setEditando} onAbrirAba={setAba} toast={toast} />
          </div>
        ) : aba === 'bioquimica' ? (
          <TabelaSub tipo="bioquimica" itens={bios} pend={pend} destacados={destacados}
            onReordenar={(a, b) => reordenar('bioquimica', a, b)} onEditarTeste={() => {}} toast={toast} />
        ) : aba === 'testes' ? (
          <TabelaSub tipo="teste" itens={testes} pend={pend} destacados={destacados}
            onReordenar={(a, b) => reordenar('teste', a, b)} onEditarTeste={setEditTeste} toast={toast} />
        ) : (
          <TabelaSub tipo="pcr" itens={pcrs} pend={pend} destacados={destacados}
            onReordenar={(a, b) => reordenar('pcr', a, b)} onEditarTeste={t => setEditPcr(t as PcrExame)} toast={toast} />
        )}
      </main>

      {/* Barra de alterações pendentes */}
      {nPend > 0 && (
        <div className="fixed bottom-0 inset-x-0 z-40 bg-white border-t border-amber-200 shadow-[0_-4px_16px_rgba(0,0,0,0.06)]">
          <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
            <span className="text-amber-600">●</span>
            <span className="text-sm font-semibold text-[#19202d]">{nPend} alteraç{nPend > 1 ? 'ões' : 'ão'} não salva{nPend > 1 ? 's' : ''}</span>
            <button onClick={() => { if (confirm('Descartar todas as alterações não salvas?')) pend.limpar() }}
              className={`ml-auto ${BTN_SECUNDARIO}`}>Descartar</button>
            <button onClick={() => setRevisando(true)} className={BTN_PRIMARIO}>Revisar e salvar</button>
          </div>
        </div>
      )}

      {toastMsg && (
        <div className={`fixed left-1/2 -translate-x-1/2 z-[60] bg-[#19202d] text-white text-sm px-4 py-2.5 rounded-lg shadow-lg ${nPend > 0 ? 'bottom-20' : 'bottom-6'}`}
          role="status">{toastMsg}</div>
      )}

      {revisando && (
        <RevisaoModal pend={pend} exames={exames} onClose={() => setRevisando(false)}
          onSalvo={async (n, registros) => {
            setRevisando(false)
            pend.limpar()
            await carregar()
            destacar(registros)
            toast(`✓ ${n} alteraç${n > 1 ? 'ões' : 'ão'} salva${n > 1 ? 's' : ''}`)
          }} />
      )}

      {editando && (
        <ExameEditModal exame={editando} onClose={() => setEditando(null)}
          onSaved={lista => {
            pend.limparRegistro('comissoes_exame', editando.id)
            setExames(lista); setEditando(null)
            destacar([`comissoes_exame:${editando.id}`]); toast('✓ Salvo')
          }} />
      )}

      {editTeste && (
        <TesteRapidoEditModal teste={editTeste} onClose={() => setEditTeste(null)}
          onSaved={t => { setTestes(prev => prev.map(x => x.id === t.id ? t : x)); setEditTeste(null); toast('✓ Salvo') }} />
      )}

      {novo === 'exames' && (
        <NovoExameModal onClose={() => setNovo(null)}
          onCreated={c => {
            setExames(prev => [...prev, c].sort((a, b) => a.tipo_exame.localeCompare(b.tipo_exame)))
            setNovo(null); destacar([`comissoes_exame:${c.id}`]); toast(`${c.tipo_exame} criado inativo`)
          }} />
      )}
      {editPcr && (
        <TesteRapidoEditModal teste={editPcr} tipo="pcr" onClose={() => setEditPcr(null)}
          onSaved={t => { setPcrs(prev => prev.map(x => x.id === t.id ? t as PcrExame : x)); setEditPcr(null); toast('✓ Salvo') }} />
      )}

      {tipoNovo && (
        <NovoSubModal tipo={tipoNovo}
          nextOrdem={ITENS_DO_TIPO[tipoNovo].reduce((m, x) => Math.max(m, x.ordem ?? 0), 0) + 1}
          onClose={() => setNovo(null)}
          onCreated={async () => { setNovo(null); await carregar(); toast('Criado inativo') }} />
      )}
    </div>
  )
}

// Hemograma: parâmetros exibidos no laudo e parser do CSV exportado pelo
// analisador hematológico (5 diferenciais, separador ";", valores entre aspas
// simples nos campos de texto). Sem dependências de servidor — usado também
// pelos testes.

export type GrupoHemograma = 'eritrograma' | 'leucograma' | 'plaquetograma'

export interface ParametroHemograma {
  codigo:  string
  nome:    string
  unidade: string
  grupo:   GrupoHemograma
  /** Coluna do CSV do analisador. */
  coluna:  string
  /** Casas decimais mínimas no laudo (as mesmas da tela da máquina). */
  casas:   number
}

/**
 * Parâmetros do laudo, na ordem em que aparecem. No leucograma, cada célula
 * tem o relativo (`X_REL`, %) e o absoluto (`X_ABS`, 10³/µL) — o laudo mostra
 * os dois lado a lado.
 */
export const PARAMETROS_HEMOGRAMA: ParametroHemograma[] = [
  { codigo: 'HEM',      nome: 'Hemácias',            unidade: '10⁶/µL', grupo: 'eritrograma',   coluna: 'HEM',    casas: 2 },
  { codigo: 'HGB',      nome: 'Hemoglobina',         unidade: 'g/dL',   grupo: 'eritrograma',   coluna: 'HGB',    casas: 1 },
  { codigo: 'HCT',      nome: 'Hematócrito',         unidade: '%',      grupo: 'eritrograma',   coluna: 'HCT',    casas: 1 },
  { codigo: 'VCM',      nome: 'VCM',                 unidade: 'fL',     grupo: 'eritrograma',   coluna: 'VCM',    casas: 1 },
  { codigo: 'HCM',      nome: 'HCM',                 unidade: 'pg',     grupo: 'eritrograma',   coluna: 'HCM',    casas: 1 },
  { codigo: 'CHCM',     nome: 'CHCM',                unidade: 'g/dL',   grupo: 'eritrograma',   coluna: 'CHCM',   casas: 1 },
  { codigo: 'RDW',      nome: 'RDW-CV',              unidade: '%',      grupo: 'eritrograma',   coluna: 'RDW_CV', casas: 1 },
  // Reticulócitos só vêm quando a amostra roda no modo com reticulócitos;
  // vazios, não aparecem no laudo.
  { codigo: 'RETIC',     nome: 'Reticulócitos',         unidade: '%',      grupo: 'eritrograma', coluna: 'RETIC',     casas: 2 },
  { codigo: 'RETIC_ABS', nome: 'Reticulócitos (abs.)',  unidade: '10³/µL', grupo: 'eritrograma', coluna: 'RETIC_ABS', casas: 1 },
  // Fração de reticulócitos imaturos; a máquina não traz referência (0–99,99)
  { codigo: 'IRF',       nome: 'IRF (retic. imaturos)', unidade: '%',      grupo: 'eritrograma', coluna: 'IRF',       casas: 2 },
  { codigo: 'LEU',      nome: 'Leucócitos totais',   unidade: '10³/µL', grupo: 'leucograma',    coluna: 'LEU',    casas: 2 },
  { codigo: 'NEU_REL',  nome: 'Neutrófilos',         unidade: '%',      grupo: 'leucograma',    coluna: 'NEU%',   casas: 2 },
  { codigo: 'NEU_ABS',  nome: 'Neutrófilos',         unidade: '10³/µL', grupo: 'leucograma',    coluna: 'NEU#',   casas: 3 },
  { codigo: 'LIN_REL',  nome: 'Linfócitos',          unidade: '%',      grupo: 'leucograma',    coluna: 'LIN%',   casas: 2 },
  { codigo: 'LIN_ABS',  nome: 'Linfócitos',          unidade: '10³/µL', grupo: 'leucograma',    coluna: 'LIN#',   casas: 3 },
  { codigo: 'MON_REL',  nome: 'Monócitos',           unidade: '%',      grupo: 'leucograma',    coluna: 'MON%',   casas: 2 },
  { codigo: 'MON_ABS',  nome: 'Monócitos',           unidade: '10³/µL', grupo: 'leucograma',    coluna: 'MON#',   casas: 3 },
  { codigo: 'EOS_REL',  nome: 'Eosinófilos',         unidade: '%',      grupo: 'leucograma',    coluna: 'EOS%',   casas: 2 },
  { codigo: 'EOS_ABS',  nome: 'Eosinófilos',         unidade: '10³/µL', grupo: 'leucograma',    coluna: 'EOS#',   casas: 3 },
  { codigo: 'BASO_REL', nome: 'Basófilos',           unidade: '%',      grupo: 'leucograma',    coluna: 'BASO%',  casas: 2 },
  { codigo: 'BASO_ABS', nome: 'Basófilos',           unidade: '10³/µL', grupo: 'leucograma',    coluna: 'BASO#',  casas: 3 },
  { codigo: 'PLQ',      nome: 'Plaquetas',           unidade: '10³/µL', grupo: 'plaquetograma', coluna: 'PLQ',    casas: 0 },
  { codigo: 'VPM',      nome: 'VPM',                 unidade: 'fL',     grupo: 'plaquetograma', coluna: 'VPM',    casas: 1 },
]

/**
 * Exames que emitem laudo por esta tela. O exame "Reticulócitos" usa o mesmo
 * importador do CSV (a máquina roda o modo "Teste Retic." como amostra à parte).
 */
export type ExameHemograma = 'hemograma' | 'reticulocitos'

export const TITULO_EXAME: Record<ExameHemograma, string> = {
  hemograma:     'Hemograma',
  reticulocitos: 'Reticulócitos',
}

/** "HEMOGRAMA", "Reticulócitos", "RETICULOCITOS"... → qual exame é (ou null). */
export function exameHemogramaDe(tipoExame: string | null | undefined): ExameHemograma | null {
  const k = (tipoExame ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  if (k.includes('reticul'))  return 'reticulocitos'
  if (k.includes('hemograma')) return 'hemograma'
  return null
}

/** Células do diferencial de leucócitos (prefixo do código). */
export const CELULAS_LEUCOGRAMA = ['NEU', 'LIN', 'MON', 'EOS', 'BASO'] as const

export const GRUPOS_HEMOGRAMA: { grupo: GrupoHemograma; titulo: string }[] = [
  { grupo: 'eritrograma',   titulo: 'Eritrograma' },
  { grupo: 'leucograma',    titulo: 'Leucograma' },
  { grupo: 'plaquetograma', titulo: 'Plaquetograma' },
]

export function parametroPorCodigo(codigo: string): ParametroHemograma | undefined {
  return PARAMETROS_HEMOGRAMA.find(p => p.codigo === codigo)
}

/** Uma amostra (linha) do CSV do analisador. */
export interface AmostraHemograma {
  /** ID interno do analisador (coluna "ID"). */
  id:           string
  /** Nome do paciente: coluna "Paciente" ou, se vazia, "No. Amostra". */
  paciente:     string
  /** Espécie como o analisador escreve ("Cachorro", "Gato"...). */
  animal:       string
  proprietario: string
  /** Coluna "Gênero" do analisador, normalizada ("Macho" | "Fêmea" | ''). */
  sexo:         string
  idade:        string
  modo:         string
  /** Data/hora da análise como veio ("15/10/2026 15:18"). */
  data_hora:    string
  /** Data da análise em ISO (YYYY-MM-DD) ou '' se não deu pra ler. */
  data_iso:     string
  /** Valores por código de parâmetro (string, ponto decimal); ausente = vazio. */
  valores:      Record<string, string>
  /** Códigos cujo valor veio marcado com "*" pela máquina (conferir). */
  marcados:     string[]
}

// Remove aspas simples de campos de texto ("'pirulito'" → "pirulito") e trata
// placeholders que o analisador deixa quando o campo não foi preenchido.
function limparCampo(raw: string | undefined): string {
  const s = (raw ?? '').trim().replace(/^'(.*)'$/, '$1').trim()
  if (/^Y{4}-M{2}-D{2}/.test(s)) return ''
  return s
}

// O analisador marca alguns resultados com "*" na frente (ex.: reticulócitos
// no modo "Teste Retic.": "*0.26"). O número vale; a marca é devolvida à parte.
function limparNumero(raw: string | undefined): { valor: string; marcado: boolean } {
  let s = limparCampo(raw).replace(',', '.')
  const marcado = s.startsWith('*')
  if (marcado) s = s.slice(1).trim()
  return /^-?\d+(\.\d+)?$/.test(s) ? { valor: s, marcado } : { valor: '', marcado: false }
}

/** Idade como o analisador escreve ("2 Y", "6 M", "10 D") → "2 anos", "6 meses"... */
export function normalizarIdade(s: string): string {
  const m = s.trim().match(/^(\d+(?:[.,]\d+)?)\s*([YMDAymda])\b/)
  if (!m) return s.trim()
  const n = m[1].replace('.', ',')
  const um = n === '1'
  switch (m[2].toUpperCase()) {
    case 'Y': case 'A': return `${n} ${um ? 'ano' : 'anos'}`
    case 'M':           return `${n} ${um ? 'mês' : 'meses'}`
    default:            return `${n} ${um ? 'dia' : 'dias'}`
  }
}

/** Gênero do analisador → "Macho" | "Fêmea" | '' (se não reconhecer). */
export function normalizarSexo(s: string): string {
  const k = s.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  if (['femea', 'female', 'f'].includes(k)) return 'Fêmea'
  if (['macho', 'male', 'm'].includes(k))   return 'Macho'
  return ''
}

/** "15/10/2026 15:18" → "2026-10-15"; aceita também "2026-10-15 ...". */
export function dataAnaliseIso(s: string): string {
  let m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  if (m) return `${m[3]}-${m[2]}-${m[1]}`
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  return ''
}

/** Divide uma linha de CSV respeitando campos entre aspas duplas. */
function dividirCsv(linha: string, sep: string): string[] {
  const out: string[] = []
  let atual = ''
  let aspas = false
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i]
    if (c === '"') {
      if (aspas && linha[i + 1] === '"') { atual += '"'; i++ }
      else aspas = !aspas
    } else if (c === sep && !aspas) {
      out.push(atual); atual = ''
    } else {
      atual += c
    }
  }
  out.push(atual)
  return out
}

/**
 * Lê o CSV exportado pelo analisador. Cada linha não vazia depois do
 * cabeçalho vira uma amostra. Lança erro se o arquivo não tiver as colunas
 * esperadas (ex.: outro tipo de arquivo).
 */
export function parseHemogramaCsv(texto: string): AmostraHemograma[] {
  const linhas = texto.replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim() !== '')
  if (linhas.length < 2) return []

  // O analisador exporta com "," por padrão, mas pode vir com ";" dependendo
  // da configuração — detecta pelo cabeçalho.
  const sep = (linhas[0].match(/;/g)?.length ?? 0) > (linhas[0].match(/,/g)?.length ?? 0) ? ';' : ','
  const dividir = (linha: string) => dividirCsv(linha, sep)

  const cabecalho = dividir(linhas[0]).map(c => c.trim())
  const idx = (col: string) => cabecalho.indexOf(col)

  for (const obrigatoria of ['LEU', 'HEM', 'HGB', 'HCT', 'PLQ']) {
    if (idx(obrigatoria) < 0) {
      throw new Error(`Coluna "${obrigatoria}" não encontrada — o arquivo não parece ser do analisador hematológico.`)
    }
  }

  const amostras: AmostraHemograma[] = []
  for (const linha of linhas.slice(1)) {
    const cel = dividir(linha)
    const campo = (col: string) => { const i = idx(col); return i >= 0 ? limparCampo(cel[i]) : '' }

    const valores: Record<string, string> = {}
    const marcados: string[] = []
    for (const p of PARAMETROS_HEMOGRAMA) {
      const i = idx(p.coluna)
      if (i < 0) continue
      const { valor, marcado } = limparNumero(cel[i])
      if (!valor) continue
      valores[p.codigo] = valor
      if (marcado) marcados.push(p.codigo)
    }
    if (Object.keys(valores).length === 0) continue

    const data_hora = campo('Tempo')
    amostras.push({
      id:           campo('ID'),
      paciente:     campo('Paciente') || campo('No. Amostra'),
      animal:       campo('Animal') || campo('Grupo'),
      proprietario: campo('Proprietário'),
      sexo:         normalizarSexo(campo('Gênero')),
      idade:        normalizarIdade(campo('Idade')),
      modo:         campo('Modo'),
      data_hora,
      data_iso:     dataAnaliseIso(data_hora),
      valores,
      marcados,
    })
  }
  return amostras
}

// ── Referências e montagem das linhas do laudo ────────────────────────────────

export interface ReferenciaHemograma {
  parametro: string
  valor_min: number | null
  valor_max: number | null
}

export type StatusValor = 'N' | 'H' | 'L' | ''

export function statusValor(valor: string, ref: ReferenciaHemograma | undefined): StatusValor {
  const n = parseFloat(valor)
  if (isNaN(n) || !ref) return ''
  if (ref.valor_max !== null && n > ref.valor_max) return 'H'
  if (ref.valor_min !== null && n < ref.valor_min) return 'L'
  if (ref.valor_min === null && ref.valor_max === null) return ''
  return 'N'
}

/**
 * Formata número no padrão brasileiro com pelo menos as casas do parâmetro —
 * nunca menos casas do que o valor trouxe (81.13 não vira "81,1").
 */
export function formatarValor(valor: string, casas: number): string {
  const n = parseFloat(valor)
  if (isNaN(n)) return valor
  const casasDoValor = (valor.trim().split(/[.,]/)[1] ?? '').length
  const c = Math.max(casas, casasDoValor)
  return n.toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c })
}

/** Linha simples (eritrograma, plaquetograma, leucócitos totais). */
export interface LinhaSimples {
  tipo:      'simples'
  codigo:    string
  nome:      string
  unidade:   string
  valor:     string
  casas:     number
  ref:       ReferenciaHemograma | undefined
  status:    StatusValor
}

/** Linha do diferencial: relativo + absoluto da mesma célula. */
export interface LinhaDiferencial {
  tipo:       'diferencial'
  celula:     string
  nome:       string
  relativo:   string
  absoluto:   string
  ref_rel:    ReferenciaHemograma | undefined
  ref_abs:    ReferenciaHemograma | undefined
  status_rel: StatusValor
  status_abs: StatusValor
  /** Alto/Baixo se o relativo OU o absoluto estiver fora (como a máquina sinaliza). */
  status:     StatusValor
}

export type LinhaHemograma = LinhaSimples | LinhaDiferencial

export function montarLinhasHemograma(
  valores: Record<string, string>,
  referencias: ReferenciaHemograma[],
): Record<GrupoHemograma, LinhaHemograma[]> {
  const ref = (codigo: string) => referencias.find(r => r.parametro === codigo)
  const out: Record<GrupoHemograma, LinhaHemograma[]> = { eritrograma: [], leucograma: [], plaquetograma: [] }

  for (const p of PARAMETROS_HEMOGRAMA) {
    // Relativo/absoluto do diferencial vão juntos na linha da célula (abaixo)
    if (p.grupo === 'leucograma' && (p.codigo.endsWith('_REL') || p.codigo.endsWith('_ABS'))) continue
    const valor = (valores[p.codigo] ?? '').trim()
    if (!valor) continue
    out[p.grupo].push({
      tipo: 'simples', codigo: p.codigo, nome: p.nome, unidade: p.unidade,
      valor, casas: p.casas, ref: ref(p.codigo), status: statusValor(valor, ref(p.codigo)),
    })
  }

  for (const cel of CELULAS_LEUCOGRAMA) {
    const relativo = (valores[`${cel}_REL`] ?? '').trim()
    const absoluto = (valores[`${cel}_ABS`] ?? '').trim()
    if (!relativo && !absoluto) continue
    const ref_rel = ref(`${cel}_REL`)
    const ref_abs = ref(`${cel}_ABS`)
    const status_rel = relativo ? statusValor(relativo, ref_rel) : ''
    const status_abs = absoluto ? statusValor(absoluto, ref_abs) : ''
    const status: StatusValor =
      status_rel === 'H' || status_abs === 'H' ? 'H'
      : status_rel === 'L' || status_abs === 'L' ? 'L'
      : status_abs || status_rel
    out.leucograma.push({
      tipo: 'diferencial', celula: cel, nome: parametroPorCodigo(`${cel}_REL`)!.nome,
      relativo, absoluto, ref_rel, ref_abs, status_rel, status_abs, status,
    })
  }

  return out
}

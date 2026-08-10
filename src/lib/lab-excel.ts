/**
 * lab-excel.ts — leitura e escrita do catálogo de labs parceiros em Excel.
 *
 * O fluxo de atualização do catálogo é: a equipe baixa o Excel do sistema
 * (/api/labs/exames/exportar), edita preços/exames na planilha e sobe de volta
 * (/api/labs/exames/importar). O import casa as colunas pelo NOME do cabeçalho
 * (ordem livre, acento/caixa ignorados), então tanto o arquivo exportado pelo
 * sistema quanto a planilha original do PDF funcionam.
 *
 * Chave de casamento com o banco: código (Tecsa) ou nome+categoria (Hormonalle,
 * que não tem código). Linhas novas são inseridas; existentes têm apenas as
 * colunas presentes na planilha atualizadas; linhas do banco ausentes na
 * planilha são só reportadas (nunca apagadas automaticamente).
 */
import * as XLSX from 'xlsx'

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface LabExameDb {
  id: number
  laboratorio_id: number
  codigo: string | null
  nome: string
  categoria: string | null
  cor_tubo: string | null
  material_tipo: string | null
  material_volume_ml: number | null
  especies: string | null
  prazo_dias_uteis: number | null
  custo: number | null
  preco_cliente: number | null
  preco_parceiro: number | null
  is_combo: boolean
  sob_consulta: boolean
  ativo: boolean
}

/** Campos que a planilha pode trazer (undefined = coluna ausente, não mexe). */
export interface LinhaPlanilha {
  codigo?: string | null
  nome: string
  categoria?: string | null
  cor_tubo?: string | null
  material_tipo?: string | null
  especies?: string | null
  prazo_dias_uteis?: number | null
  custo?: number | null
  preco_cliente?: number | null
  preco_parceiro?: number | null
  sob_consulta?: boolean
  ativo?: boolean
  linha: number // nº da linha na planilha (para mensagens de erro)
}

export interface DiffImport {
  novos: { lab: string; linha: LinhaPlanilha }[]
  atualizados: { lab: string; id: number; linha: LinhaPlanilha; mudancas: string[] }[]
  iguais: number
  ausentes: { lab: string; codigo: string | null; nome: string }[]
  erros: string[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function norm(s: unknown): string {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

/** Converte célula de preço: aceita número, '1.461,33', '1461.33', 'R$ 12,50', 'Sob Consulta'. */
export function parsePreco(v: unknown): { valor: number | null; sobConsulta: boolean } {
  if (v === null || v === undefined || String(v).trim() === '') return { valor: null, sobConsulta: false }
  if (typeof v === 'number') return { valor: Math.round(v * 100) / 100, sobConsulta: false }
  const s = String(v).trim()
  if (/sob\s*consulta/i.test(s)) return { valor: null, sobConsulta: true }
  let limpo = s.replace(/R\$\s?/i, '').trim()
  // '1.461,33' → 1461.33 | '1461.33' → 1461.33 | '154' → 154
  if (/,\d{1,2}$/.test(limpo)) limpo = limpo.replace(/\./g, '').replace(',', '.')
  const n = parseFloat(limpo)
  return isNaN(n) ? { valor: null, sobConsulta: false } : { valor: Math.round(n * 100) / 100, sobConsulta: false }
}

function parseInteiro(v: unknown): number | null {
  if (v === null || v === undefined || String(v).trim() === '') return null
  const n = parseInt(String(v).replace(/\D/g, ''))
  return isNaN(n) ? null : n
}

function parseBool(v: unknown): boolean | undefined {
  if (v === null || v === undefined || String(v).trim() === '') return undefined
  const s = norm(v)
  if (['sim', 's', 'true', '1', 'x'].includes(s)) return true
  if (['nao', 'n', 'false', '0', ''].includes(s)) return false
  return undefined
}

function volumeDoMaterial(material: string | null | undefined): number | null {
  if (!material) return null
  const m = material.match(/(\d+),(\d+) ?m?[lL]/)
  return m ? parseFloat(`${m[1]}.${m[2]}`) : null
}

function isCombo(nome: string): boolean {
  return /PERFIL|PAINEL|TRIAGEM|CHECK ?-? ?UP| \+ |\+ /i.test(nome)
}

// ── Leitura da planilha ───────────────────────────────────────────────────────

/** Mapeia cabeçalho → campo. Retorna null para colunas desconhecidas (ignoradas). */
function campoDoCabecalho(header: string): keyof LinhaPlanilha | null {
  const h = norm(header)
  if (h === 'codigo' || h === 'cod' || h === 'cod.') return 'codigo'
  if (h === 'exame' || h === 'nome') return 'nome'
  if (h === 'categoria') return 'categoria'
  if (h.includes('cor do tubo') || h === 'tubo') return 'cor_tubo'
  if (h.includes('material')) return 'material_tipo'
  if (h.includes('especie')) return 'especies'
  if (h.includes('dias uteis') || h.includes('prazo')) return 'prazo_dias_uteis'
  if (h.includes('custo')) return 'custo'
  if (h.includes('+40') || h.includes('cliente')) return 'preco_cliente'
  if (h.includes('parceir')) return 'preco_parceiro'
  if (h.includes('sob consulta')) return 'sob_consulta'
  if (h === 'ativo') return 'ativo'
  return null
}

/** Lê uma aba: acha a linha de cabeçalho (contém 'Exame') e parseia as linhas de dados. */
export function lerAba(ws: XLSX.WorkSheet, erros: string[], aba: string): LinhaPlanilha[] {
  const grade: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null })
  const headerIdx = grade.findIndex(row =>
    row.some(c => norm(c) === 'exame') &&
    row.some(c => campoDoCabecalho(String(c ?? '')) !== null),
  )
  if (headerIdx < 0) {
    erros.push(`Aba ${aba}: não achei a linha de cabeçalho (coluna "Exame").`)
    return []
  }
  const campos = grade[headerIdx].map(c => campoDoCabecalho(String(c ?? '')))
  const out: LinhaPlanilha[] = []
  for (let i = headerIdx + 1; i < grade.length; i++) {
    const row = grade[i]
    if (row.every(c => c === null || String(c).trim() === '')) continue
    const bruto: Partial<Record<keyof LinhaPlanilha, unknown>> = {}
    campos.forEach((campo, col) => { if (campo) bruto[campo] = row[col] })

    const nome = String(bruto.nome ?? '').trim()
    if (!nome) { erros.push(`Aba ${aba}, linha ${i + 1}: sem nome de exame — ignorada.`); continue }

    const custo = parsePreco(bruto.custo)
    const cliente = parsePreco(bruto.preco_cliente)
    const parceiro = parsePreco(bruto.preco_parceiro)
    const material = bruto.material_tipo !== undefined ? (String(bruto.material_tipo ?? '').trim() || null) : undefined

    const linha: LinhaPlanilha = { nome, linha: i + 1 }
    if (bruto.codigo !== undefined) linha.codigo = String(bruto.codigo ?? '').trim() || null
    if (bruto.categoria !== undefined) linha.categoria = String(bruto.categoria ?? '').trim() || null
    if (bruto.cor_tubo !== undefined) linha.cor_tubo = String(bruto.cor_tubo ?? '').trim() || null
    if (material !== undefined) linha.material_tipo = material
    if (bruto.especies !== undefined) linha.especies = String(bruto.especies ?? '').trim() || null
    if (bruto.prazo_dias_uteis !== undefined) linha.prazo_dias_uteis = parseInteiro(bruto.prazo_dias_uteis)
    if (bruto.custo !== undefined) linha.custo = custo.valor
    if (bruto.preco_cliente !== undefined) linha.preco_cliente = cliente.valor
    if (bruto.preco_parceiro !== undefined) linha.preco_parceiro = parceiro.valor
    // 'Sob Consulta' explícito na coluna, ou inferido de qualquer célula de preço
    const sobExplicito = bruto.sob_consulta !== undefined ? parseBool(bruto.sob_consulta) : undefined
    if (sobExplicito !== undefined) linha.sob_consulta = sobExplicito
    else if (custo.sobConsulta || cliente.sobConsulta) linha.sob_consulta = true
    const ativo = parseBool(bruto.ativo)
    if (ativo !== undefined) linha.ativo = ativo
    out.push(linha)
  }
  return out
}

// ── Diff planilha × banco ─────────────────────────────────────────────────────

const CAMPOS_COMPARAVEIS: (keyof LinhaPlanilha & keyof LabExameDb)[] = [
  'codigo', 'categoria', 'cor_tubo', 'material_tipo', 'especies',
  'prazo_dias_uteis', 'custo', 'preco_cliente', 'preco_parceiro', 'sob_consulta', 'ativo',
]

function chaveDb(e: { codigo: string | null; nome: string; categoria: string | null }): string {
  return e.codigo ? `c:${norm(e.codigo)}` : `n:${norm(e.nome)}`
}

export function diffCatalogo(
  porLab: { lab: string; laboratorio_id: number; linhas: LinhaPlanilha[] }[],
  existentes: LabExameDb[],
  erros: string[],
): DiffImport {
  const diff: DiffImport = { novos: [], atualizados: [], iguais: 0, ausentes: [], erros }

  for (const { lab, laboratorio_id, linhas } of porLab) {
    const doLab = existentes.filter(e => e.laboratorio_id === laboratorio_id)
    const mapa = new Map(doLab.map(e => [chaveDb(e), e]))
    const vistos = new Set<string>()

    for (const linha of linhas) {
      const chave = linha.codigo ? `c:${norm(linha.codigo)}` : `n:${norm(linha.nome)}`
      if (vistos.has(chave)) {
        erros.push(`Aba ${lab}, linha ${linha.linha}: duplicada na planilha (${linha.codigo ?? linha.nome}) — ignorada.`)
        continue
      }
      vistos.add(chave)
      const atual = mapa.get(chave)
      if (!atual) { diff.novos.push({ lab, linha }); continue }

      const mudancas: string[] = []
      for (const campo of CAMPOS_COMPARAVEIS) {
        const novo = linha[campo]
        if (novo === undefined) continue // coluna ausente na planilha
        const antigo = atual[campo]
        const a = antigo === null || antigo === undefined ? null : antigo
        const b = novo === null ? null : novo
        if (typeof a === 'number' || typeof b === 'number') {
          if ((a === null) !== (b === null) || (a !== null && Math.abs(Number(a) - Number(b)) > 0.004)) {
            mudancas.push(campo)
          }
        } else if (String(a ?? '') !== String(b ?? '')) {
          mudancas.push(campo)
        }
      }
      // nome pode mudar quando a chave é o código
      if (linha.codigo && norm(atual.nome) !== norm(linha.nome)) mudancas.push('nome')
      if (mudancas.length) diff.atualizados.push({ lab, id: atual.id, linha, mudancas })
      else diff.iguais++
    }

    for (const e of doLab) {
      if (!vistos.has(chaveDb(e))) diff.ausentes.push({ lab, codigo: e.codigo, nome: e.nome })
    }
  }
  return diff
}

/** Monta o payload de update/insert a partir de uma linha (só campos presentes). */
export function payloadDaLinha(linha: LinhaPlanilha, laboratorio_id: number): Record<string, unknown> {
  const p: Record<string, unknown> = { laboratorio_id, nome: linha.nome, is_combo: isCombo(linha.nome) }
  for (const campo of CAMPOS_COMPARAVEIS) {
    if (linha[campo] !== undefined) p[campo] = linha[campo]
  }
  if (linha.material_tipo !== undefined) p.material_volume_ml = volumeDoMaterial(linha.material_tipo)
  return p
}

// ── Escrita (export) ──────────────────────────────────────────────────────────

export function gerarExcel(labs: { id: number; nome: string }[], exames: LabExameDb[]): Buffer {
  const wb = XLSX.utils.book_new()
  for (const lab of labs) {
    const doLab = exames
      .filter(e => e.laboratorio_id === lab.id)
      .sort((a, b) => (a.categoria ?? '').localeCompare(b.categoria ?? '', 'pt-BR') ||
        a.nome.localeCompare(b.nome, 'pt-BR'))
    const linhas = doLab.map(e => ({
      'Código': e.codigo ?? '',
      'Exame': e.nome,
      'Categoria': e.categoria ?? '',
      'Cor do Tubo': e.cor_tubo ?? '',
      'Quantidade de Material': e.material_tipo ?? '',
      'Espécie': e.especies ?? '',
      'Dias Úteis': e.prazo_dias_uteis ?? '',
      'Valor de Custo': e.custo ?? '',
      'Valor +40% Lucro': e.preco_cliente ?? '',
      'Vet e Clínica Parceira': e.preco_parceiro ?? '',
      'Sob Consulta': e.sob_consulta ? 'Sim' : '',
      'Ativo': e.ativo ? 'Sim' : 'Não',
    }))
    const ws = XLSX.utils.json_to_sheet(linhas)
    ws['!cols'] = [
      { wch: 8 }, { wch: 55 }, { wch: 28 }, { wch: 22 }, { wch: 40 },
      { wch: 28 }, { wch: 9 }, { wch: 13 }, { wch: 15 }, { wch: 18 }, { wch: 12 }, { wch: 7 },
    ]
    XLSX.utils.book_append_sheet(wb, ws, lab.nome.toUpperCase().slice(0, 31))
  }
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}

import 'server-only'
import {
  montarHtmlBase, renderizarPdf, escapeHtml as esc, calcDotPct, type LaudoBaseData,
} from './generate-bioquimica-pdf'
import {
  GRUPOS_HEMOGRAMA, formatarValor, montarLinhasHemograma, parametroPorCodigo,
  type LinhaDiferencial, type LinhaSimples, type ReferenciaHemograma, type StatusValor,
} from './hemograma'
import { carregarReferenciasHemograma } from './hemograma-referencias'

export interface HemogramaPDFData extends LaudoBaseData {
  /** Valores por código de parâmetro (ver PARAMETROS_HEMOGRAMA). */
  valores:     Record<string, string>
  referencias: ReferenciaHemograma[]
  observacoes: string
}

const CSS = `
  .info-card{ padding: 2.5mm 3.5mm; }
  .info-card .label{ margin-bottom: 1.2mm; }
  .info-card dl{ gap: .6mm 3mm; }
  .dates-bar{ padding: 1.5mm 4mm; }
  .section-head{ margin-top: 2.5mm; margin-bottom: 0; }
  .hemo-group{
    margin-top: 2mm;
    font-size: 7.4pt; font-weight: 700; letter-spacing: 1.2px;
    text-transform: uppercase; color: var(--ink);
    display:flex; align-items:center; gap: 3mm;
  }
  .hemo-group::after{ content:""; flex:1; height:1px; background: var(--teal); }
  table.exams{ font-size: 8pt; margin-top: .8mm; }
  table.exams thead th{ padding: 1mm 2.5mm; font-size: 6.4pt; white-space: nowrap; }
  table.exams thead th .u{ text-transform: none; letter-spacing: .3px; }
  table.exams tbody td{ padding: .55mm 2.5mm; }
  .exam-name{ font-size: 8pt; }
  .result-cell .num{ font-size: 8.6pt; }
  .ref{ font-family: 'Courier New', Courier, monospace; font-size: 7.4pt; color: var(--muted); text-align:right; white-space:nowrap; }
  .range{ min-width: 26mm; }
  .range-track{ height: 3px; }
  .range-labels{ display:none; }
  .status{ padding: .4mm 2.2mm; font-size: 6.4pt; }
  .fora-h{ color: var(--bad) !important; }
  .fora-l{ color: var(--warn) !important; }
  .flag{ font-size: 6.4pt; font-weight: 700; margin-left: .8mm; font-family: 'Inter', sans-serif; }
  .obs{
    margin-top: 2.5mm; padding: 2mm 4mm;
    border: 1px solid var(--line); border-left: 2px solid var(--gold);
    background: var(--cream); font-size: 8pt; line-height: 1.4; white-space: pre-wrap;
  }
  .obs .label{
    font-size: 6.8pt; letter-spacing: 1.8px; text-transform: uppercase;
    color: var(--teal); font-weight: 600; margin-bottom: .8mm; white-space: normal;
  }
`

function statusPill(st: StatusValor): string {
  if (st === 'H') return '<span class="status high">Alto</span>'
  if (st === 'L') return '<span class="status low">Baixo</span>'
  if (st === 'N') return '<span class="status normal">Normal</span>'
  return ''
}

/** Valor com destaque quando fora da faixa (vermelho H / laranja L), como na máquina. */
function valorCell(texto: string, st: StatusValor): string {
  if (st === 'H') return `<span class="num fora-h">${texto}</span><span class="flag fora-h">H</span>`
  if (st === 'L') return `<span class="num fora-l">${texto}</span><span class="flag fora-l">L</span>`
  return `<span class="num">${texto}</span>`
}

function refTexto(ref: ReferenciaHemograma | undefined, casas: number): string {
  if (!ref || (ref.valor_min === null && ref.valor_max === null)) return '—'
  const f = (n: number | null) => n === null ? '' : formatarValor(String(n), casas)
  if (ref.valor_min === null) return `até ${f(ref.valor_max)}`
  if (ref.valor_max === null) return `≥ ${f(ref.valor_min)}`
  return `${f(ref.valor_min)} – ${f(ref.valor_max)}`
}

function rangeBar(valor: string, ref: ReferenciaHemograma | undefined, st: StatusValor): string {
  const n = parseFloat(valor)
  if (!ref || ref.valor_min === null || ref.valor_max === null || isNaN(n)) return ''
  const pct = calcDotPct(n, ref.valor_min, ref.valor_max)
  const cls = st === 'H' ? 'dot high' : st === 'L' ? 'dot low' : 'dot'
  return `<div class="range"><div class="range-track">
      <div class="zone" style="left:10%;right:10%"></div>
      <div class="${cls}" style="left:${pct.toFixed(1)}%"></div>
    </div></div>`
}

function tabelaSimples(linhas: LinhaSimples[]): string {
  const rows = linhas.map(l => `<tr>
      <td class="exam-name">${esc(l.nome)}</td>
      <td class="result-cell num">${valorCell(formatarValor(l.valor, l.casas), l.status)}<span class="unit">${esc(l.unidade)}</span></td>
      <td class="ref">${refTexto(l.ref, l.casas)}</td>
      <td>${rangeBar(l.valor, l.ref, l.status)}</td>
      <td style="text-align:center">${statusPill(l.status)}</td>
    </tr>`).join('\n')
  return `<table class="exams">
    <thead><tr>
      <th style="width:30%">Exame</th>
      <th class="num-col" style="width:20%">Resultado</th>
      <th class="num-col" style="width:18%">Referência</th>
      <th style="width:20%"></th>
      <th class="center" style="width:12%">Status</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`
}

function tabelaLeucograma(total: LinhaSimples | undefined, difs: LinhaDiferencial[]): string {
  const casasRel = parametroPorCodigo('NEU_REL')!.casas
  const casasAbs = parametroPorCodigo('NEU_ABS')!.casas
  const rows: string[] = []
  if (total) {
    rows.push(`<tr>
      <td class="exam-name">${esc(total.nome)}</td>
      <td></td><td></td>
      <td class="result-cell num">${valorCell(formatarValor(total.valor, total.casas), total.status)}</td>
      <td class="ref">${refTexto(total.ref, total.casas)}</td>
      <td style="text-align:center">${statusPill(total.status)}</td>
    </tr>`)
  }
  for (const d of difs) {
    rows.push(`<tr>
      <td class="exam-name">${esc(d.nome)}</td>
      <td class="result-cell num">${d.relativo ? valorCell(formatarValor(d.relativo, casasRel), d.status_rel) : '<span class="num">—</span>'}</td>
      <td class="ref">${refTexto(d.ref_rel, casasRel)}</td>
      <td class="result-cell num">${d.absoluto ? valorCell(formatarValor(d.absoluto, casasAbs), d.status_abs) : '<span class="num">—</span>'}</td>
      <td class="ref">${refTexto(d.ref_abs, casasAbs)}</td>
      <td style="text-align:center">${statusPill(d.status)}</td>
    </tr>`)
  }
  return `<table class="exams">
    <thead><tr>
      <th style="width:26%">Exame</th>
      <th class="num-col" style="width:12%">Relativo <span class="u">(%)</span></th>
      <th class="num-col" style="width:16%">Ref. <span class="u">(%)</span></th>
      <th class="num-col" style="width:16%">Absoluto <span class="u">(10³/µL)</span></th>
      <th class="num-col" style="width:18%">Ref. <span class="u">(10³/µL)</span></th>
      <th class="center" style="width:12%">Status</th>
    </tr></thead>
    <tbody>${rows.join('\n')}</tbody>
  </table>`
}

export async function generateHemogramaPDF(data: HemogramaPDFData): Promise<Buffer> {
  let html = montarHtmlBase({ ...data, titulo: data.titulo || 'Hemograma' }, CSS)

  const grupos = montarLinhasHemograma(data.valores, data.referencias)
  const partes: string[] = []

  for (const { grupo, titulo } of GRUPOS_HEMOGRAMA) {
    const linhas = grupos[grupo]
    if (!linhas.length) continue
    partes.push(`<div class="hemo-group">${titulo}</div>`)
    if (grupo === 'leucograma') {
      const total = linhas.find((l): l is LinhaSimples => l.tipo === 'simples')
      const difs  = linhas.filter((l): l is LinhaDiferencial => l.tipo === 'diferencial')
      partes.push(tabelaLeucograma(total, difs))
    } else {
      partes.push(tabelaSimples(linhas as LinhaSimples[]))
    }
  }

  if (data.observacoes.trim()) {
    partes.push(`<div class="obs"><div class="label">Observações</div>${esc(data.observacoes.trim())}</div>`)
  }

  // Mantém o cabeçalho de seção do template e troca a tabela de exemplo
  html = html.replace(/<table class="exams">[\s\S]*?<\/table>/, partes.join('\n'))

  return renderizarPdf(html)
}

/** O que a tela manda para prévia/salvamento: referências são resolvidas aqui. */
export interface HemogramaEntrada extends Omit<HemogramaPDFData, 'referencias'> {
  faixa_etaria: string
}

export async function gerarLaudoHemograma(entrada: HemogramaEntrada): Promise<{
  pdf: Buffer
  referencias: ReferenciaHemograma[]
}> {
  const referencias = await carregarReferenciasHemograma(entrada.especie, entrada.faixa_etaria)
  const pdf = await generateHemogramaPDF({ ...entrada, referencias })
  return { pdf, referencias }
}

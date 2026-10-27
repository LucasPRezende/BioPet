import 'server-only'
import { montarHtmlBase, renderizarPdf, escapeHtml as esc, type LaudoBaseData } from './generate-bioquimica-pdf'
import {
  CAMPOS_FISICO, CAMPOS_SEDIMENTO, linhasManuais, montarLinhasUrina, notasAutomaticas,
  type LinhaManual, type ReferenciaUrina, type StatusUrina, type TipoFita,
} from './urinalise'
import { carregarReferenciasUrina } from './urinalise-referencias'

export interface UrinalisePDFData extends LaudoBaseData {
  fita:        TipoFita
  /** Parte química por código (LEU, KET...), como lida da máquina e conferida. */
  valores:     Record<string, string>
  /** Exame físico e sedimentoscopia digitados (códigos de CAMPOS_FISICO / CAMPOS_SEDIMENTO). */
  fisico:      Record<string, string>
  sedimento:   Record<string, string>
  referencias: ReferenciaUrina[]
  observacoes: string
}

const CSS = `
  .info-card{ padding: 2.5mm 3.5mm; }
  .info-card .label{ margin-bottom: 1.2mm; }
  .info-card dl{ gap: .6mm 3mm; }
  .dates-bar{ padding: 1.5mm 4mm; }
  .section-head{ margin-top: 2.5mm; margin-bottom: 0; }
  .uri-group{
    margin-top: 2mm; break-after: avoid;
    font-size: 7.4pt; font-weight: 700; letter-spacing: 1.2px;
    text-transform: uppercase; color: var(--ink);
    display:flex; align-items:center; gap: 3mm;
  }
  .uri-group::after{ content:""; flex:1; height:1px; background: var(--teal); }
  table.exams{ font-size: 8pt; margin-top: .8mm; }
  table.exams thead th{ padding: 1mm 2.5mm; font-size: 6.4pt; white-space: nowrap; }
  table.exams tbody td{ padding: .45mm 2.5mm; }
  .exam-name{ font-size: 8pt; }
  .result-cell .num{ font-size: 8.6pt; }
  .ref{ font-family: 'Courier New', Courier, monospace; font-size: 7.4pt; color: var(--muted); text-align:right; white-space:nowrap; }
  .status{ padding: .4mm 2.2mm; font-size: 6.4pt; }
  .fora{ color: var(--bad) !important; font-weight: 700; }
  .obs{
    margin-top: 2.5mm; padding: 2mm 4mm;
    border: 1px solid var(--line); border-left: 2px solid var(--gold);
    background: var(--cream); font-size: 8pt; line-height: 1.4; white-space: pre-wrap;
    break-inside: avoid; page-break-inside: avoid;
  }
  .obs .label{
    font-size: 6.8pt; letter-spacing: 1.8px; text-transform: uppercase;
    color: var(--teal); font-weight: 600; margin-bottom: .8mm; white-space: normal;
  }
  .metodo{ margin-top: 1.5mm; font-size: 6.6pt; color: var(--muted); line-height: 1.35; }
`

function statusPill(st: StatusUrina): string {
  if (st === 'A') return '<span class="status high">Alterado</span>'
  if (st === 'B') return '<span class="status low">Baixo</span>'
  if (st === 'N') return '<span class="status normal">Normal</span>'
  return ''
}

function tabelaManual(linhas: LinhaManual[]): string {
  const comRef = linhas.some(l => l.referencia)
  const rows = linhas.map(l => `<tr>
      <td class="exam-name">${esc(l.nome)}</td>
      <td class="result-cell">${esc(l.valor)}</td>
      ${comRef ? `<td class="ref">${esc(l.referencia || '—')}</td>` : ''}
    </tr>`).join('\n')
  return `<table class="exams">
    <thead><tr>
      <th style="width:38%">Exame</th>
      <th style="width:${comRef ? 34 : 62}%">Resultado</th>
      ${comRef ? '<th class="num-col" style="width:28%">Referência</th>' : ''}
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`
}

export async function generateUrinalisePDF(data: UrinalisePDFData): Promise<Buffer> {
  let html = montarHtmlBase({ ...data, titulo: data.titulo || 'Urinálise', material: data.material || 'Urina' }, CSS)
  const partes: string[] = []

  const fisico = linhasManuais(CAMPOS_FISICO, data.fisico)
  if (fisico.length) {
    partes.push('<div class="uri-group">Exame físico</div>', tabelaManual(fisico))
  }

  const quimica = montarLinhasUrina(data.valores, data.referencias)
  if (quimica.length) {
    const rows = quimica.map(l => `<tr>
        <td class="exam-name">${esc(l.nome)}</td>
        <td class="result-cell num"><span class="num${l.status === 'A' || l.status === 'B' ? ' fora' : ''}">${esc(l.texto)}</span>${l.unidade ? `<span class="unit">${esc(l.unidade)}</span>` : ''}</td>
        <td class="ref">${esc(l.referencia)}</td>
        <td style="text-align:center">${statusPill(l.status)}</td>
      </tr>`).join('\n')
    partes.push(`<div class="uri-group">Exame químico</div>
      <table class="exams">
        <thead><tr>
          <th style="width:36%">Exame</th>
          <th class="num-col" style="width:24%">Resultado</th>
          <th class="num-col" style="width:24%">Referência</th>
          <th class="center" style="width:16%">Status</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="metodo">Método: fita reagente URIT ${data.fita}G em leitor automatizado (URIT UC-32B).</div>`)
  }

  const sedimento = linhasManuais(CAMPOS_SEDIMENTO, data.sedimento)
  if (sedimento.length) {
    partes.push('<div class="uri-group">Sedimentoscopia</div>', tabelaManual(sedimento))
  }

  const obs = [...notasAutomaticas(data.valores), data.observacoes.trim()].filter(Boolean).join('\n')
  if (obs) {
    partes.push(`<div class="obs"><div class="label">Observações</div>${esc(obs)}</div>`)
  }

  // Mantém o cabeçalho de seção do template e troca a tabela de exemplo
  html = html.replace(/<table class="exams">[\s\S]*?<\/table>/, partes.join('\n'))

  return renderizarPdf(html)
}

/** O que a tela manda para prévia/salvamento: as referências são resolvidas aqui. */
export type UrinaliseEntrada = Omit<UrinalisePDFData, 'referencias'>

export async function gerarLaudoUrinalise(entrada: UrinaliseEntrada): Promise<{
  pdf: Buffer
  referencias: ReferenciaUrina[]
}> {
  const referencias = await carregarReferenciasUrina(entrada.especie)
  const pdf = await generateUrinalisePDF({ ...entrada, referencias })
  return { pdf, referencias }
}

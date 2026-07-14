import 'server-only'
import fs from 'fs'
import path from 'path'
import { launchBrowser } from './chromium'

export type ResultadoStatus = 'neg' | 'pos' | 'nreag' | 'reag' | 'indet'

export interface TesteRapidoResultado {
  nome:      string
  descricao: string | null
  material:  string
  metodo:    string
  status:    ResultadoStatus
}

export interface TesteRapidoPDFData {
  nome_pet:     string
  especie:      string
  raca:         string
  sexo:         string
  idade:        string
  tutor:        string
  medico:       string
  crmv:         string
  clinica:      string
  material:     string
  data_laudo:   string
  data_coleta:  string
  resultados:   TesteRapidoResultado[]
  observacoes:  string[]
}

// Rótulo + classe CSS de cada status do resultado
const STATUS_META: Record<ResultadoStatus, { label: string; cls: string }> = {
  neg:   { label: 'Negativo',      cls: 'neg' },
  pos:   { label: 'Positivo',      cls: 'pos' },
  reag:  { label: 'Reagente',      cls: 'pos' },
  nreag: { label: 'Não reagente',  cls: 'nreag' },
  indet: { label: 'Indeterminado', cls: 'nreag' },
}

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function formatDate(dateStr: string): string {
  const d     = new Date(dateStr + 'T12:00:00')
  const day   = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const year  = d.getFullYear()
  return `${day} / ${month} / ${year}`
}

function toBase64(filePath: string): string | null {
  try { return fs.readFileSync(filePath).toString('base64') } catch { return null }
}

function buildRow(r: TesteRapidoResultado): string {
  const meta = STATUS_META[r.status] ?? STATUS_META.neg
  const small = r.descricao ? `<small>${esc(r.descricao)}</small>` : ''
  return `<tr>
    <td class="exam-name">${esc(r.nome)} ${small}</td>
    <td class="material-cell">${esc(r.material)}</td>
    <td class="method-cell">${esc(r.metodo)}</td>
    <td style="text-align:center"><span class="status ${meta.cls}">${esc(meta.label)}</span></td>
  </tr>`
}

export async function generateTesteRapidoPDF(data: TesteRapidoPDFData): Promise<Buffer> {
  const templatePath = path.join(process.cwd(), 'template', 'Laudo Teste Rapido.html')
  let html = fs.readFileSync(templatePath, 'utf-8')

  // Embed images as base64
  const assetsDir = path.join(process.cwd(), 'template', 'assets')
  const logoB64   = toBase64(path.join(assetsDir, 'logo-full.png'))
  const sigB64    = toBase64(path.join(assetsDir, 'assinatura.png'))
  if (logoB64) html = html.replace(/src="assets\/logo-full\.png"/, `src="data:image/png;base64,${logoB64}"`)
  if (sigB64) {
    html = html.replace(/src="assets\/assinatura\.png"/, `src="data:image/png;base64,${sigB64}"`)
  } else {
    // Sem imagem de assinatura: remove o <img> para não exibir ícone quebrado
    html = html.replace(/<img class="sig-image"[^>]*>/, '')
  }

  // Remove on-screen toolbar
  html = html.replace(/<div class="toolbar">[\s\S]*?<\/div>/, '')

  // Fontes de sistema para renderização nítida no PDF
  html = html.replace('</head>', `<style>
    .date-value, .sig-crmv { font-family: 'Courier New', Courier, monospace !important; }
    * { -webkit-font-smoothing: antialiased; }
  </style></head>`)

  // ── Cards de informação ─────────────────────────────────────────────────────
  const pacienteDl = [
    `<dt>Nome</dt><dd>${esc(data.nome_pet)}</dd>`,
    data.especie ? `<dt>Espécie</dt><dd>${esc(data.especie)}</dd>` : '',
    data.raca    ? `<dt>Raça</dt><dd>${esc(data.raca)}</dd>`       : '',
    data.sexo    ? `<dt>Sexo</dt><dd>${esc(data.sexo)}</dd>`       : '',
    data.idade   ? `<dt>Idade</dt><dd>${esc(data.idade)}</dd>`     : '',
  ].filter(Boolean).join('')

  const solicitanteDl = [
    data.medico  ? `<dt>Médico(a)</dt><dd>${esc(data.medico)}</dd>` : '',
    data.crmv    ? `<dt>CRMV</dt><dd>${esc(data.crmv)}</dd>`        : '',
    data.clinica ? `<dt>Clínica</dt><dd>${esc(data.clinica)}</dd>`  : '',
    data.material ? `<dt>Material</dt><dd>${esc(data.material)}</dd>` : '',
  ].filter(Boolean).join('')

  const infoCards = `<div class="info-card">
      <div class="label">Paciente</div>
      <dl>${pacienteDl}</dl>
    </div>
    <div class="info-card">
      <div class="label">Tutor(a)</div>
      <dl><dt>Nome</dt><dd>${esc(data.tutor)}</dd></dl>
    </div>
    <div class="info-card">
      <div class="label">Solicitante</div>
      <dl>${solicitanteDl || '<dt>Material</dt><dd>—</dd>'}</dl>
    </div>`

  html = html.replace(
    /(<section class="info-grid">)[\s\S]*?(<\/section>)/,
    `$1${infoCards}$2`,
  )

  // ── Barra de datas ──────────────────────────────────────────────────────────
  const dataEmissao = data.data_laudo ? formatDate(data.data_laudo) : formatDate(new Date().toISOString().slice(0, 10))
  const datesParts  = [`<div class="date-row">
      <span class="date-label">Emissão</span>
      <span class="date-value">${dataEmissao}</span>
    </div>`]
  if (data.data_coleta) {
    datesParts.push(`<div class="date-row">
      <span class="date-label">Coleta</span>
      <span class="date-value">${formatDate(data.data_coleta)}</span>
    </div>`)
  }
  html = html.replace(
    /(<section class="dates-bar">)[\s\S]*?(<\/section>)/,
    `$1${datesParts.join('')}$2`,
  )

  // ── Linhas de resultado ─────────────────────────────────────────────────────
  const rows = data.resultados.map(buildRow).join('\n')
  html = html.replace(/<tbody>[\s\S]*?<\/tbody>/, `<tbody>${rows}</tbody>`)

  // ── Observações ─────────────────────────────────────────────────────────────
  const obsParas = data.observacoes
    .map(o => o.trim())
    .filter(Boolean)
    .map(o => `<p>${esc(o)}</p>`)
    .join('')
  if (obsParas) {
    html = html.replace(
      /(<div class="obs-block">\s*<div class="obs-title">Observações<\/div>)[\s\S]*?(<\/div>)/,
      `$1${obsParas}$2`,
    )
  } else {
    // Sem observações: remove o bloco inteiro
    html = html.replace(/<div class="obs-block">[\s\S]*?<\/div>\s*<\/div>/, '')
  }

  // ── Gera PDF via puppeteer ──────────────────────────────────────────────────
  const browser = await launchBrowser()
  try {
    const page = await browser.newPage()
    await page.setViewport({ width: 1240, height: 1754, deviceScaleFactor: 2 })
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30_000 })
    const pdf = await page.pdf({
      format:          'A4',
      printBackground: true,
      margin:          { top: '0', right: '0', bottom: '0', left: '0' },
    })
    return Buffer.from(pdf)
  } finally {
    await browser.close()
  }
}

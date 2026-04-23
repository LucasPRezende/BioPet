import 'server-only'
import fs from 'fs'
import path from 'path'
import { launchBrowser } from './chromium'

export interface BioquimicaExame {
  codigo:    string
  nome:      string
  valor:     string
  unidade:   string
  metodo:    string
  status:    'N' | 'H' | 'L' | ''
  valor_min: number | null
  valor_max: number | null
}

export interface BioquimicaPDFData {
  nome_pet:   string
  especie:    string
  raca:       string
  sexo:       string
  idade:      string
  peso:       string
  tutor:      string
  telefone:   string
  medico:     string
  crmv:       string
  clinica:    string
  material:   string
  data_laudo: string
  resultados: BioquimicaExame[]
}

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  const local  = digits.startsWith('55') && digits.length > 11 ? digits.slice(2) : digits
  if (local.length === 11) return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`
  if (local.length === 10) return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`
  return raw
}

function formatPeso(peso: string): string {
  const trimmed = peso.trim()
  if (!trimmed) return ''
  if (/[a-zA-Z]/.test(trimmed)) return trimmed
  return `${trimmed} kg`
}

function formatDate(dateStr: string): string {
  const d     = new Date(dateStr + 'T12:00:00')
  const day   = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const year  = d.getFullYear()
  return `${day} / ${month} / ${year}`
}

function calcDotPct(valor: number, min: number, max: number): number {
  const range = max - min
  if (range <= 0) return 50
  const normalized = (valor - min) / range
  return Math.min(Math.max(10 + normalized * 80, 2), 98)
}

function buildExamRow(r: BioquimicaExame): string {
  const hasRef = r.valor_min !== null && r.valor_max !== null
  const numVal = parseFloat(r.valor.replace(',', '.'))

  let statusClass = 'normal'
  let statusText  = 'Normal'
  if (r.status === 'H' || (!isNaN(numVal) && hasRef && numVal > r.valor_max!)) {
    statusClass = 'high'; statusText = 'Alto'
  } else if (r.status === 'L' || (!isNaN(numVal) && hasRef && numVal < r.valor_min!)) {
    statusClass = 'low';  statusText = 'Baixo'
  }

  let rangeHtml = ''
  let minTd     = ''
  let maxTd     = ''

  if (hasRef) {
    const pct    = !isNaN(numVal) ? calcDotPct(numVal, r.valor_min!, r.valor_max!) : 50
    const dotCls = statusClass !== 'normal' ? `dot ${statusClass}` : 'dot'
    rangeHtml = `
      <div class="range">
        <div class="range-track">
          <div class="zone" style="left:10%;right:10%"></div>
          <div class="${dotCls}" style="left:${pct.toFixed(1)}%"></div>
        </div>
        <div class="range-labels">
          <span>${r.valor_min}</span>
          <span>${r.valor_max} ${esc(r.unidade)}</span>
        </div>
      </div>`
    minTd = String(r.valor_min)
    maxTd = String(r.valor_max)
  }

  return `<tr>
    <td class="exam-name">${esc(r.nome)}</td>
    <td class="result-cell"><span class="num">${esc(r.valor)}</span><span class="unit">${esc(r.unidade)}</span></td>
    <td class="num">${minTd}</td>
    <td class="num">${maxTd}</td>
    <td>${rangeHtml}</td>
    <td style="font-size:7.5pt;color:var(--muted)">${esc(r.metodo ?? '')}</td>
    <td style="text-align:center"><span class="status ${statusClass}">${statusText}</span></td>
  </tr>`
}

function toBase64(filePath: string): string | null {
  try { return fs.readFileSync(filePath).toString('base64') } catch { return null }
}

export async function generateBioquimicaPDF(data: BioquimicaPDFData): Promise<Buffer> {
  const templatePath = path.join(process.cwd(), 'template', 'Laudo Veterinario.html')
  let html = fs.readFileSync(templatePath, 'utf-8')

  // Embed images as base64
  const assetsDir = path.join(process.cwd(), 'template', 'assets')
  const logoB64   = toBase64(path.join(assetsDir, 'logo-full.png'))
  const sigB64    = toBase64(path.join(assetsDir, 'assinatura.png'))
  if (logoB64) html = html.replace(/src="assets\/logo-full\.png"/, `src="data:image/png;base64,${logoB64}"`)
  if (sigB64)  html = html.replace(/src="assets\/assinatura\.png"/, `src="data:image/png;base64,${sigB64}"`)

  // Remove on-screen toolbar
  html = html.replace(/<div class="toolbar">[\s\S]*?<\/div>/, '')

  // Fix font rendering — replace Google web fonts with system fonts for crisp PDF output
  html = html.replace('</head>', `<style>
    .num, .range-labels { font-family: 'Courier New', Courier, monospace !important; }
    * { -webkit-font-smoothing: antialiased; }
  </style></head>`)

  // ── Build card values ──────────────────────────────────────────────────────
  const telefoneFormatado = formatPhone(data.telefone)
  const pesoFormatado     = formatPeso(data.peso)
  const dataFormatada     = data.data_laudo ? formatDate(data.data_laudo) : formatDate(new Date().toISOString().slice(0, 10))
  const material          = data.material || 'Soro sanguíneo'

  // ── Patient info cards ─────────────────────────────────────────────────────
  const pacienteCard = `<div class="info-card">
      <div class="label">Paciente</div>
      <dl>
        <dt>Nome</dt><dd>${esc(data.nome_pet)}</dd>
        <dt>Espécie</dt><dd>${esc(data.especie)}</dd>
        ${data.raca       ? `<dt>Raça</dt><dd>${esc(data.raca)}</dd>`           : ''}
        ${data.sexo       ? `<dt>Sexo</dt><dd>${esc(data.sexo)}</dd>`           : ''}
        ${data.idade      ? `<dt>Idade</dt><dd>${esc(data.idade)}</dd>`         : ''}
        ${pesoFormatado   ? `<dt>Peso</dt><dd>${esc(pesoFormatado)}</dd>`       : ''}
      </dl>
    </div>
    <div class="info-card">
      <div class="label">Responsável Legal</div>
      <dl>
        <dt>Nome</dt><dd>${esc(data.tutor)}</dd>
        <dt>Telefone</dt><dd>${esc(telefoneFormatado)}</dd>
      </dl>
    </div>
    <div class="info-card">
      <div class="label">Solicitante</div>
      <dl>
        ${data.medico  ? `<dt>Médico(a)</dt><dd>${esc(data.medico)}</dd>`  : ''}
        ${data.crmv    ? `<dt>CRMV</dt><dd>${esc(data.crmv)}</dd>`        : ''}
        ${data.clinica ? `<dt>Clínica</dt><dd>${esc(data.clinica)}</dd>`  : ''}
        <dt>Material</dt><dd>${esc(material)}</dd>
      </dl>
    </div>`

  html = html.replace(
    /(<section class="info-grid"[^>]*>)[\s\S]*?(<\/section>)/,
    `$1${pacienteCard}$2`,
  )

  // ── Dates bar ──────────────────────────────────────────────────────────────
  const datesHtml = `<div class="date-row">
      <span class="date-label">Emissão</span>
      <span class="date-value">${dataFormatada}</span>
    </div>`

  html = html.replace(
    /(<section class="dates-bar">)[\s\S]*?(<\/section>)/,
    `$1${datesHtml}$2`,
  )

  // ── Exam rows ──────────────────────────────────────────────────────────────
  const examRows = data.resultados
    .filter(r => r.valor.trim() !== '')
    .map(buildExamRow)
    .join('\n')

  html = html.replace(/<tbody>[\s\S]*?<\/tbody>/, `<tbody>${examRows}</tbody>`)

  // ── Generate PDF via puppeteer ─────────────────────────────────────────────
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

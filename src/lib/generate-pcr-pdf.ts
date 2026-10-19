import 'server-only'
import fs from 'fs'
import path from 'path'
import { launchBrowser } from './chromium'
import { classificarCt, REFERENCIA_CT, STATUS_PCR, type StatusPcr } from './pcr-resultado'

// Laudo de PCR no padrão BioPet: mesmo template do Teste Rápido (cabeçalho,
// cards, assinatura, rodapé), com Ct, a curva de amplificação recortada do
// relatório do equipamento (lib/pcr-curva) e a tabela de interpretação do Ct.

export interface PcrResultado {
  alvo: string
  ct:   number
}

export interface PcrPDFData {
  nome_pet:     string
  especie:      string
  raca:         string
  sexo:         string
  idade:        string
  tutor:        string
  telefone?:    string
  medico:       string
  crmv:         string
  clinica:      string
  material:     string
  /** Parágrafo "Método" abaixo da tabela. */
  metodo:       string
  data_laudo:   string
  data_coleta:  string
  resultados:   PcrResultado[]
  observacoes:  string[]
  /** Curva de amplificação recortada do relatório (data URL), ou null. */
  curva?:       string | null
}

/** Nota de validade do relatório do equipamento, sempre no fim das observações. */
const NOTA_VALIDADE = 'Este relatório é válido apenas para a amostra testada e para diagnóstico in vitro. ' +
  'Em caso de dúvidas, entre em contato conosco em até 7 dias úteis após o recebimento do relatório.'

// A curva vem do cliente (devolvida pela leitura do PDF) e vai direto para o
// HTML do laudo: só aceita JPEG/PNG em data URL e de tamanho razoável.
const CURVA_OK  = /^data:image\/(jpeg|png);base64,[A-Za-z0-9+/=]+$/
const CURVA_MAX = 3 * 1024 * 1024

const CLASSE: Record<StatusPcr, string> = {
  neg: 'neg', pos_forte: 'pos', pos: 'pos', pos_fraco: 'pos', limitrofe: 'warn', invalido: 'nreag',
}

// Linha em destaque na tabela de interpretação (verde = padrão do .ativo).
const CLASSE_REF: Record<StatusPcr, string> = {
  neg: '', pos_forte: 'pos', pos: 'pos', pos_fraco: 'pos', limitrofe: 'warn', invalido: '',
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

function fmtCt(ct: number): string {
  return ct === 0 ? '0' : ct.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

/** "5524999999999" → "(24) 99999-9999" (mesma regra da agenda); internacional fica como veio. */
function formatTelefone(tel: string): string {
  const digits = tel.replace(/\D/g, '').replace(/^55/, '')
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  return tel
}

function toBase64(filePath: string): string | null {
  try { return fs.readFileSync(filePath).toString('base64') } catch { return null }
}

/**
 * Confere os resultados antes de gerar: todo alvo precisa de nome e de um Ct
 * que caia na tabela. O status é SEMPRE recalculado aqui a partir do Ct — o
 * cliente não manda o resultado. Devolve a mensagem de erro ou null.
 */
export function validarResultadosPcr(resultados: PcrResultado[] | undefined): string | null {
  if (!resultados?.length) return 'Nenhum resultado informado.'
  for (const r of resultados) {
    if (!r.alvo?.trim()) return 'Há um agente sem nome.'
    const status = classificarCt(Number(r.ct))
    if (status === null) return `Ct de "${r.alvo}" fora da tabela de referência (0 a 40).`
    if (status === 'invalido') return `"${r.alvo}" deu Ct inválido (entre 0 e 10): refaça o teste antes de emitir.`
  }
  return null
}

/**
 * Nome científico em itálico: "Leishmania spp." → <i>Leishmania</i> spp.,
 * "Mycoplasma felis" → <i>Mycoplasma felis</i>. Siglas e nomes comuns (FIV,
 * Cinomose, Painel...) ficam como estão.
 */
export function nomeCientificoHtml(nome: string): string {
  const m = /^([A-Z][a-z]+)\s+(spp?\.?|[a-z]+)(.*)$/.exec(nome.trim())
  if (!m) return esc(nome)
  const [, genero, especie, resto] = m
  return /^spp?\.?$/.test(especie)
    ? `<i>${esc(genero)}</i> ${esc(especie)}${esc(resto)}`
    : `<i>${esc(genero)} ${esc(especie)}</i>${esc(resto)}`
}

/** "Positivo: texto" → rótulo em negrito. */
function paragrafoObs(o: string): string {
  const m = /^(Positivo|Negativo|Limítrofe|Inválido):\s*([\s\S]*)$/.exec(o)
  return m ? `<p><b>${esc(m[1])}:</b> ${esc(m[2])}</p>` : `<p>${esc(o)}</p>`
}

function buildRow(r: PcrResultado, material: string): string {
  const status = classificarCt(Number(r.ct)) ?? 'invalido'
  return `<tr>
    <td class="exam-name">${nomeCientificoHtml(r.alvo)}<small>Real Time PCR</small></td>
    <td class="material-cell">${esc(material)}</td>
    <td class="ct-cell">${esc(fmtCt(Number(r.ct)))}</td>
    <td style="text-align:center"><span class="status ${CLASSE[status]}">${esc(STATUS_PCR[status].label)}</span></td>
  </tr>`
}

export async function generatePcrPDF(data: PcrPDFData): Promise<Buffer> {
  const templatePath = path.join(process.cwd(), 'template', 'Laudo PCR.html')
  let html = fs.readFileSync(templatePath, 'utf-8')

  // Embed images as base64
  const assetsDir = path.join(process.cwd(), 'template', 'assets')
  const logoB64   = toBase64(path.join(assetsDir, 'logo-full.png'))
  const sigB64    = toBase64(path.join(assetsDir, 'assinatura.png'))
  if (logoB64) html = html.replace(/src="assets\/logo-full\.png"/, `src="data:image/png;base64,${logoB64}"`)
  if (sigB64) {
    html = html.replace(/src="assets\/assinatura\.png"/, `src="data:image/png;base64,${sigB64}"`)
  } else {
    html = html.replace(/<img class="sig-image"[^>]*>/, '')
  }

  html = html.replace(/<div class="toolbar">[\s\S]*?<\/div>/, '')

  html = html.replace('</head>', `<style>
    .date-value, .sig-crmv, .ct-cell, table.ref td.faixa { font-family: 'Courier New', Courier, monospace !important; }
    * { -webkit-font-smoothing: antialiased; }
  </style></head>`)

  // ── Cards de informação ─────────────────────────────────────────────────────
  const pacienteDl = [
    `<dt>Nome</dt><dd>${esc(data.nome_pet)}</dd>`,
    data.especie ? `<dt>Espécie</dt><dd>${esc(data.especie)}</dd>` : '',
    data.raca    ? `<dt>Raça</dt><dd>${esc(data.raca)}</dd>`       : '',
    data.sexo    ? `<dt>Sexo</dt><dd>${esc(data.sexo)}</dd>`       : '',
    `<dt>Idade</dt><dd>${esc(data.idade || '—')}</dd>`,
  ].filter(Boolean).join('')

  const tutorDl = [
    `<dt>Nome</dt><dd>${esc(data.tutor)}</dd>`,
    data.telefone ? `<dt>Telefone</dt><dd>${esc(formatTelefone(data.telefone))}</dd>` : '',
  ].join('')

  const amostraDl = [
    `<dt>Material</dt><dd>${esc(data.material || '—')}</dd>`,
    data.medico  ? `<dt>Solicitante</dt><dd>${esc(data.medico)}</dd>` : '',
    data.crmv    ? `<dt>CRMV</dt><dd>${esc(data.crmv)}</dd>`          : '',
    data.clinica ? `<dt>Clínica</dt><dd>${esc(data.clinica)}</dd>`    : '',
  ].filter(Boolean).join('')

  const infoCards = `<div class="info-card">
      <div class="label">Paciente</div>
      <dl>${pacienteDl}</dl>
    </div>
    <div class="info-card">
      <div class="label">Tutor(a)</div>
      <dl>${tutorDl}</dl>
    </div>
    <div class="info-card">
      <div class="label">Amostra</div>
      <dl>${amostraDl}</dl>
    </div>`

  html = html.replace(/(<section class="info-grid">)[\s\S]*?(<\/section>)/, `$1${infoCards}$2`)

  // ── Barra de datas ──────────────────────────────────────────────────────────
  const dataLiberacao = data.data_laudo ? formatDate(data.data_laudo) : formatDate(new Date().toISOString().slice(0, 10))
  const datesParts: string[] = []
  if (data.data_coleta) {
    datesParts.push(`<div class="date-row">
      <span class="date-label">Coleta</span>
      <span class="date-value">${formatDate(data.data_coleta)}</span>
    </div>`)
  }
  datesParts.push(`<div class="date-row">
      <span class="date-label">Liberação</span>
      <span class="date-value">${dataLiberacao}</span>
    </div>`)
  html = html.replace(/(<section class="dates-bar">)[\s\S]*?(<\/section>)/, `$1${datesParts.join('')}$2`)

  // ── Resultados + método ─────────────────────────────────────────────────────
  const rows = data.resultados.map(r => buildRow(r, data.material)).join('\n')
  html = html.replace(/<tbody>[\s\S]*?<\/tbody>/, `<tbody>${rows}</tbody>`)

  html = data.metodo?.trim()
    ? html.replace('<p class="metodo"></p>', `<p class="metodo"><b>Método:</b> ${esc(data.metodo.trim())}</p>`)
    : html.replace('<p class="metodo"></p>', '')

  // ── Curva + interpretação do Ct (faixas dos resultados em destaque) ─────────
  const presentes = new Set(data.resultados.map(r => classificarCt(Number(r.ct))).filter(Boolean))
  const ref = REFERENCIA_CT.map(r => {
    const cls = presentes.has(r.status) ? `ativo ${CLASSE_REF[r.status]}`.trim() : ''
    return `<tr class="${cls}"><td class="faixa">${esc(r.faixa)}</td><td>${esc(STATUS_PCR[r.status].label)}</td></tr>`
  }).join('')
  const tabelaRef = `<table class="ref"><caption>Interpretação do valor Ct</caption><tbody>${ref}</tbody></table>`

  const curva = data.curva && data.curva.length <= CURVA_MAX && CURVA_OK.test(data.curva) ? data.curva : null
  const analise = curva
    ? `<div class="curva-card">
        <img src="${curva}" alt="Curva de amplificação" />
        <div class="curva-legenda"><span><i class="l-amostra"></i>Amostra</span><span><i class="l-limiar"></i>Limiar</span></div>
        <div class="curva-fonte">Fluorescência × ciclos · reprodução do relatório do equipamento</div>
      </div>${tabelaRef}`
    : tabelaRef
  html = html.replace('<section class="analise"></section>',
    `<section class="analise${curva ? '' : ' sem-curva'}">${analise}</section>`)

  // ── Observações (+ nota de validade) ────────────────────────────────────────
  const obsParas = data.observacoes.map(o => o.trim()).filter(Boolean).map(paragrafoObs).join('')
    + `<p class="nota">${esc(NOTA_VALIDADE)}</p>`
  html = html.replace(
    /(<div class="obs-block">\s*<div class="obs-title">Observações<\/div>)[\s\S]*?(<\/div>)/,
    `$1${obsParas}$2`,
  )

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

import 'server-only'
import fs from 'fs'
import path from 'path'
import { launchBrowser } from './chromium'

export interface ReciboPDFData {
  pagador:        string
  pet:            { nome: string; especie: string | null; raca: string | null }
  clinica:        string | null
  data_exame:     string          // ISO (data_hora do agendamento)
  forma_pagamento: string | null
  exames:         string[]
  valor:          number
}

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function toBase64(filePath: string): string | null {
  try { return fs.readFileSync(filePath).toString('base64') } catch { return null }
}

function formatBRL(n: number): string {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// ── Valor por extenso (pt-BR) ────────────────────────────────────────────────

const UNIDADES = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove']
const DEZ_DEZENOVE = ['dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove']
const DEZENAS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa']
const CENTENAS = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos']

// 1–999 por extenso
function trioExtenso(n: number): string {
  if (n === 100) return 'cem'
  const c = Math.floor(n / 100)
  const dezUni = n % 100
  const partes: string[] = []
  if (c > 0) partes.push(CENTENAS[c])
  if (dezUni > 0) {
    if (dezUni < 10)       partes.push(UNIDADES[dezUni])
    else if (dezUni < 20)  partes.push(DEZ_DEZENOVE[dezUni - 10])
    else {
      const d = Math.floor(dezUni / 10)
      const u = dezUni % 10
      partes.push(u > 0 ? `${DEZENAS[d]} e ${UNIDADES[u]}` : DEZENAS[d])
    }
  }
  return partes.join(' e ')
}

// Inteiro (0 – 999.999.999) por extenso
function inteiroExtenso(n: number): string {
  if (n === 0) return 'zero'
  const milhoes = Math.floor(n / 1_000_000)
  const milhares = Math.floor((n % 1_000_000) / 1000)
  const resto = n % 1000

  const grupos: string[] = []
  if (milhoes > 0) grupos.push(milhoes === 1 ? 'um milhão' : `${trioExtenso(milhoes)} milhões`)
  if (milhares > 0) grupos.push(milhares === 1 ? 'mil' : `${trioExtenso(milhares)} mil`)

  if (resto > 0) {
    // "e" antes do último grupo quando ele é < 100 ou centena redonda (regra do extenso)
    const conector = grupos.length > 0 && (resto < 100 || resto % 100 === 0) ? 'e ' : ''
    grupos.push(`${conector}${trioExtenso(resto)}`)
  }
  return grupos.join(' ')
}

export function valorPorExtenso(valor: number): string {
  const reais    = Math.floor(valor)
  const centavos = Math.round((valor - reais) * 100)

  const partes: string[] = []
  if (reais > 0) {
    const deReais = reais === 1 ? 'um real' : `${inteiroExtenso(reais)} reais`
    // "um milhão de reais" / "dois milhões de reais"
    partes.push(reais % 1_000_000 === 0 ? deReais.replace(' reais', ' de reais') : deReais)
  }
  if (centavos > 0) {
    partes.push(centavos === 1 ? 'um centavo' : `${inteiroExtenso(centavos)} centavos`)
  }
  if (partes.length === 0) return 'zero reais'
  return partes.join(' e ')
}

// ── Datas ────────────────────────────────────────────────────────────────────

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
               'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

function dataLongaHoje(): string {
  const agora = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))
  return `${agora.getDate()} de ${MESES[agora.getMonth()]} de ${agora.getFullYear()}`
}

function dataCurta(iso: string): string {
  const [datePart] = iso.split('T')
  const [y, m, d] = datePart.split('-')
  return `${d}/${m}/${y}`
}

// ── Geração do PDF ───────────────────────────────────────────────────────────

export async function generateReciboPDF(data: ReciboPDFData): Promise<Buffer> {
  const templatePath = path.join(process.cwd(), 'template', 'Recibo.html')
  let html = fs.readFileSync(templatePath, 'utf-8')

  // Logo e assinatura em base64 (assinatura é opcional — sem o arquivo, fica só a linha)
  const assetsDir = path.join(process.cwd(), 'template', 'assets')
  const logoB64   = toBase64(path.join(assetsDir, 'logo-full.png'))
  const sigB64    = toBase64(path.join(assetsDir, 'assinatura.png'))
  if (logoB64) html = html.replace(/src="assets\/logo-full\.png"/, `src="data:image/png;base64,${logoB64}"`)
  if (sigB64)  html = html.replace(/src="assets\/assinatura\.png"/, `src="data:image/png;base64,${sigB64}"`)
  else         html = html.replace(/<img class="sig-image"[^>]*>/, '')

  // Remove toolbar de tela
  html = html.replace(/<div class="toolbar">[\s\S]*?<\/div>/, '')

  // ── Cards de informação ────────────────────────────────────────────────────
  const pacienteCard = `<div class="info-card">
      <div class="label">Paciente</div>
      <dl>
        <dt>Nome</dt><dd>${esc(data.pet.nome)}</dd>
        ${data.pet.especie ? `<dt>Espécie</dt><dd>${esc(data.pet.especie)}</dd>` : ''}
        ${data.pet.raca    ? `<dt>Raça</dt><dd>${esc(data.pet.raca)}</dd>`       : ''}
      </dl>
    </div>`

  const atendimentoCard = `<div class="info-card">
      <div class="label">Atendimento</div>
      <dl>
        <dt>Data</dt><dd>${esc(dataCurta(data.data_exame))}</dd>
        ${data.forma_pagamento ? `<dt>Pagamento</dt><dd style="text-transform:capitalize">${esc(data.forma_pagamento)}</dd>` : ''}
        ${data.clinica         ? `<dt>Clínica</dt><dd>${esc(data.clinica)}</dd>` : ''}
      </dl>
    </div>`

  const examList = data.exames.map(e => `<li>${esc(e)}</li>`).join('\n')

  html = html
    .replace('{{INFO_CARDS}}', pacienteCard + atendimentoCard)
    .replace('{{PAGADOR}}', esc(data.pagador))
    .replace(/\{\{VALOR_FMT\}\}/g, esc(formatBRL(data.valor)))
    .replace('{{VALOR_EXTENSO}}', esc(valorPorExtenso(data.valor)))
    .replace('{{EXAM_LIST}}', examList)
    .replace('{{DATA_LOCAL}}', `Volta Redonda/RJ, ${dataLongaHoje()}.`)

  // ── PDF via puppeteer ──────────────────────────────────────────────────────
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

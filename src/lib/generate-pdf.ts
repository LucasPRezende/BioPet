import 'server-only'
import fs from 'fs'
import path from 'path'
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import { launchBrowser } from './chromium'

export interface LaudoFormData {
  animal:             string
  especie:            string
  proprietario:       string
  sexo:               string
  raca:               string
  medico_responsavel: string
  idade:              string
  data:               string
  texto:              string
  tipo_exame?:        string
}

// ── Constantes de layout (em mm e pt) ────────────────────────────────────────
const HEADER_H_MM    = 28      // altura do header desenhado pelo pdf-lib
const HEADER_MARGIN_MM = 33    // margem @page (header + 5mm de respiro acima do conteúdo)
const FOOTER_H_MM = 14      // altura reservada para o rodapé
const SIDE_PAD_MM = 12      // padding lateral
const PT_PER_MM   = 2.83465

const HEADER_H_PT = HEADER_H_MM * PT_PER_MM
const FOOTER_H_PT = FOOTER_H_MM * PT_PER_MM
const SIDE_PAD_PT = SIDE_PAD_MM * PT_PER_MM

// Cores BioPet
const C_NAVY  = rgb(13 / 255,  35 / 255,  57 / 255)   // #0D2339
const C_GOLD  = rgb(201 / 255, 169 / 255, 106 / 255)  // #C9A96A
const C_MUTED = rgb(107 / 255, 114 / 255, 128 / 255)  // #6B7280
const C_LINE  = rgb(230 / 255, 225 / 255, 214 / 255)  // #E6E1D6

function toBase64(filePath: string): string | null {
  try { return fs.readFileSync(filePath).toString('base64') } catch { return null }
}

function esc(s: string) {
  return (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function detectMime(buf: Buffer): string {
  if (buf[0] === 0x89 && buf[1] === 0x50) return 'image/png'
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg'
  if (buf[0] === 0x47 && buf[1] === 0x49) return 'image/gif'
  if (buf[0] === 0x52 && buf[1] === 0x49) return 'image/webp'
  return 'image/jpeg'
}

export async function generateLaudoPDF(
  data:           LaudoFormData,
  imagensBuffers: Buffer[],
): Promise<Buffer> {
  // ── 1. Renderiza só o CORPO via Puppeteer (sem header/rodapé) ──────────────
  // As margens reservam o espaço onde pdf-lib vai desenhar header/rodapé depois
  const html = buildBodyHtml(data, imagensBuffers)

  const browser = await launchBrowser()
  let bodyPdfBytes: Uint8Array
  try {
    const page = await browser.newPage()
    await page.setViewport({ width: 1240, height: 1754, deviceScaleFactor: 2 })
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30_000 })
    bodyPdfBytes = await page.pdf({
      format:          'A4',
      printBackground: true,
      margin: {
        top:    `${HEADER_MARGIN_MM}mm`,
        bottom: `${FOOTER_H_MM}mm`,
        left:   '0',
        right:  '0',
      },
    })
  } finally {
    await browser.close()
  }

  // ── 2. Desenha header e rodapé em todas as páginas usando pdf-lib ──────────
  return await drawHeaderFooterOnAllPages(Buffer.from(bodyPdfBytes))
}

async function drawHeaderFooterOnAllPages(bodyPdfBuffer: Buffer): Promise<Buffer> {
  const pdfDoc = await PDFDocument.load(bodyPdfBuffer)

  // Carrega assets
  const logoPath  = path.join(process.cwd(), 'template', 'assets', 'logo-full.png')
  const logoBytes = fs.readFileSync(logoPath)
  const logo      = await pdfDoc.embedPng(logoBytes)

  const helvetica       = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const helveticaItalic = await pdfDoc.embedFont(StandardFonts.HelveticaOblique)

  for (const page of pdfDoc.getPages()) {
    const { width, height } = page.getSize()

    // ── HEADER (faixa azul-marinho com logo + faixa dourada) ──────────────────
    page.drawRectangle({
      x: 0, y: height - HEADER_H_PT,
      width, height: HEADER_H_PT,
      color: C_NAVY,
    })

    // Logo centralizada — escala para caber respeitando padding vertical
    const logoMaxH = HEADER_H_PT * 0.78
    const logoMaxW = width * 0.5
    const scale    = Math.min(logoMaxH / logo.height, logoMaxW / logo.width)
    const lw       = logo.width  * scale
    const lh       = logo.height * scale
    page.drawImage(logo, {
      x: (width - lw) / 2,
      y: height - HEADER_H_PT + (HEADER_H_PT - lh) / 2,
      width:  lw,
      height: lh,
    })

    // Faixa dourada de 3pt logo abaixo do header
    page.drawRectangle({
      x: 0, y: height - HEADER_H_PT - 3,
      width, height: 3,
      color: C_GOLD,
    })

    // ── RODAPÉ (fixo no fundo, em todas as páginas) ──────────────────────────
    // Linha superior do rodapé
    page.drawLine({
      start: { x: SIDE_PAD_PT,         y: FOOTER_H_PT - 4 },
      end:   { x: width - SIDE_PAD_PT, y: FOOTER_H_PT - 4 },
      thickness: 0.5,
      color:     C_LINE,
    })

    // Endereço (esquerda, duas linhas)
    page.drawText('Av. Sávio Cota de Almeida Gama, 137 - Niterói, Volta Redonda/RJ', {
      x: SIDE_PAD_PT, y: FOOTER_H_PT - 14,
      size: 7, font: helvetica, color: C_MUTED,
    })
    page.drawText('Whatsapp: (24) 99999-9867', {
      x: SIDE_PAD_PT, y: FOOTER_H_PT - 23,
      size: 7, font: helvetica, color: C_MUTED,
    })

    // Tagline (direita, itálico dourado)
    const tagline = 'Tecnologia, precisão e cuidado em cada resultado'
    const tw      = helveticaItalic.widthOfTextAtSize(tagline, 9)
    page.drawText(tagline, {
      x: width - SIDE_PAD_PT - tw, y: FOOTER_H_PT - 18,
      size: 9, font: helveticaItalic, color: C_GOLD,
    })
  }

  const result = await pdfDoc.save()
  return Buffer.from(result)
}

function buildBodyHtml(data: LaudoFormData, imagensBuffers: Buffer[]): string {
  // Reaproveita os estilos do template original (variáveis, tipografia, cards)
  const templatePath = path.join(process.cwd(), 'template', 'Laudo Veterinario.html')
  const tpl          = fs.readFileSync(templatePath, 'utf-8')
  const styleMatch   = tpl.match(/<style>([\s\S]*?)<\/style>/)
  // Remove o @page do template (que tem margin:0) — vamos definir o nosso depois
  const baseStyles   = (styleMatch ? styleMatch[1] : '').replace(/@page\s*\{[^}]*\}/g, '')

  const sigB64 = toBase64(path.join(process.cwd(), 'template', 'assets', 'assinatura.png'))
  const sectionLabel = data.tipo_exame || 'Laudo'

  // ── Cards do paciente ──────────────────────────────────────────────────────
  const pacienteCard = `
    <div class="info-card">
      <div class="label">Paciente</div>
      <dl>
        <dt>Nome</dt><dd>${esc(data.animal)}</dd>
        <dt>Espécie</dt><dd>${esc(data.especie)}</dd>
        ${data.raca  ? `<dt>Raça</dt><dd>${esc(data.raca)}</dd>`  : ''}
        ${data.sexo  ? `<dt>Sexo</dt><dd>${esc(data.sexo)}</dd>`  : ''}
        ${data.idade ? `<dt>Idade</dt><dd>${esc(data.idade)}</dd>` : ''}
      </dl>
    </div>
    <div class="info-card">
      <div class="label">Responsável Legal</div>
      <dl><dt>Nome</dt><dd>${esc(data.proprietario)}</dd></dl>
    </div>
    <div class="info-card">
      <div class="label">Responsável Técnico</div>
      <dl><dt>Médico(a)</dt><dd>${esc(data.medico_responsavel || 'Luciana Pereira de Brites')}</dd></dl>
    </div>`

  // ── Páginas de imagem (até 2 por página) ───────────────────────────────────
  let imagePagesHtml = ''
  if (imagensBuffers.length > 0) {
    // Altura útil = 297 - margem topo - margem base - padding interno
    const AREA_MM      = 297 - HEADER_MARGIN_MM - FOOTER_H_MM - 8
    const MAX_PER_PAGE = 2

    const groups: Buffer[][] = []
    for (let i = 0; i < imagensBuffers.length; i += MAX_PER_PAGE) {
      groups.push(imagensBuffers.slice(i, i + MAX_PER_PAGE))
    }

    imagePagesHtml = groups.map(group => {
      const perImg = Math.floor((AREA_MM - (group.length - 1) * 5) / group.length)
      const imgs = group.map((buf, j) => {
        const mime = detectMime(buf)
        const b64  = buf.toString('base64')
        return `<img src="data:${mime};base64,${b64}" alt="Imagem ${j + 1}" style="max-height:${perImg}mm" />`
      }).join('\n      ')
      return `<div class="image-page"><div class="image-area">${imgs}</div></div>`
    }).join('\n')
  }

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600;700&family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
${baseStyles}

/* ── Overrides para layout multi-página (corpo apenas) ── */
@page {
  size: A4;
  margin: 33mm 0 14mm 0;   /* top = HEADER_MARGIN_MM, bottom = FOOTER_H_MM */
}

html, body {
  margin: 0; padding: 0;
  background: #fff !important;
  font-family: 'Inter', sans-serif;
  color: var(--ink);
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

/* Padding lateral do conteúdo principal */
.body-pad { padding: 4mm 12mm 0; }

/* Assinatura: bloco indivisível */
.sign-section {
  position: relative !important;
  left: auto !important; right: auto !important; bottom: auto !important;
  margin-top: 8mm;
  display: flex;
  justify-content: center;
  page-break-inside: avoid !important;
  break-inside: avoid !important;
}
.sign-section .signature,
.sign-section .sig-line {
  page-break-inside: avoid !important;
  break-inside: avoid !important;
}
.laudo-content > *:last-child {
  page-break-after: avoid;
  break-after: avoid;
}

/* Conteúdo rico do editor (TipTap HTML) */
.laudo-content { font-size: 10pt; line-height: 1.78; color: var(--ink); margin-top: 3mm; }
.laudo-content p  { margin: 0 0 2.5mm; }
.laudo-content h2 { font-size: 13pt; font-weight: 700; color: var(--ink);   margin: 5mm 0 2mm; }
.laudo-content h3 { font-size: 11pt; font-weight: 600; color: var(--ink-2); margin: 4mm 0 1.5mm; }
.laudo-content ul,
.laudo-content ol { padding-left: 6mm; margin: 0 0 2.5mm; }
.laudo-content li { margin-bottom: 1mm; }
.laudo-content strong { font-weight: 600; }
.laudo-content em     { font-style: italic; }
.laudo-content table  { border-collapse: collapse; width: 100%; margin: 3mm 0; font-size: 9.5pt; }
.laudo-content th, .laudo-content td { border: 1px solid var(--line); padding: 1.5mm 2.5mm; }
.laudo-content th { background: var(--ink); color: #fff; font-weight: 500; font-size: 8pt; }

/* Páginas de imagem */
.image-page {
  page-break-before: always;
  padding: 4mm 12mm 0;
}
.image-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 5mm;
}
.image-area img {
  max-width: 100%;
  object-fit: contain;
  display: block;
}

/* CRMV com mesma cor do texto "Médica Responsável" */
.signature .sig-crmv { color: var(--muted) !important; }

/* Sobrescreve estilos do template original que não se aplicam aqui */
.page, .header, .doc-title-bar, .doc-meta, .page-footer, .toolbar { display: none !important; }
</style>
</head>
<body>
<div class="body-pad">
  <section class="info-grid">
    ${pacienteCard}
  </section>

  <section class="dates-bar">
    <div class="date-row">
      <span class="date-label">Emissão</span>
      <span class="date-value">${esc(data.data)}</span>
    </div>
  </section>

  <div class="section-head" style="margin-top:5mm">
    <span class="tag">Resultado</span>
    <h2>${esc(sectionLabel)}</h2>
    <div class="rule"></div>
  </div>

  <div class="laudo-content">${data.texto}</div>

  <section class="sign-section">
    <div class="signature">
      ${sigB64 ? `<img class="sig-image" src="data:image/png;base64,${sigB64}" alt="Assinatura" />` : ''}
      <div class="sig-line">
        <div class="sig-name">Luciana Pereira de Brites</div>
        <div class="sig-role">Médica Responsável</div>
        <div class="sig-crmv">CRMV 12923</div>
      </div>
    </div>
  </section>
</div>

${imagePagesHtml}
</body>
</html>`
}

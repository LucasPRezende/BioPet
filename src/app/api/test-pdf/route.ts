import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { PDFDocument } from 'pdf-lib'
import { launchBrowser } from '@/lib/chromium'

// Rota de diagnóstico — gera PDF mínimo e retorna as dimensões reais de cada página
export async function GET() {
  try {
    const testDir = path.join(process.cwd(), 'template', 'Testes')

    const rawText = fs.readFileSync(path.join(testDir, 'Texto Laudo.txt'), 'utf-8')
    const texto = rawText
      .split(/\n{2,}/)
      .map(b => b.trim())
      .filter(Boolean)
      .map(b => `<p>${b.replace(/\n/g, ' ')}</p>`)
      .join('')

    // HTML mínimo para teste — fundo colorido para ver as margens
    const html = `<!doctype html><html><head><meta charset="utf-8">
<style>
  html, body { margin: 0; padding: 0; background: white; }
  .top-pad    { height: 10mm; background: red;   }
  .bot-pad    { height: 10mm; background: blue;  }
  .content    { padding: 4mm 12mm; font-size: 10pt; color: black; font-family: sans-serif; }
</style>
</head><body>
  <div class="top-pad"></div>
  <div class="content">${texto}</div>
  <div class="bot-pad"></div>
</body></html>`

    const browser = await launchBrowser()
    let bodyBytes: Uint8Array
    try {
      const page = await browser.newPage()
      await page.setViewport({ width: 1240, height: 1754, deviceScaleFactor: 2 })
      await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30_000 })
      bodyBytes = await page.pdf({
        format:          'A4',
        printBackground: true,
        margin: { top: '28mm', bottom: '14mm', left: '0', right: '0' },
      })
    } finally {
      await browser.close()
    }

    // Salva o PDF cru para inspeção
    const rawPath = path.join(testDir, 'debug-raw.pdf')
    fs.writeFileSync(rawPath, Buffer.from(bodyBytes))

    // Lê as dimensões reais de cada página
    const pdfDoc = await PDFDocument.load(bodyBytes)
    const pages  = pdfDoc.getPages()
    const info   = pages.map((p, i) => {
      const { width, height } = p.getSize()
      return { page: i + 1, width_pt: width, height_pt: height,
               width_mm: +(width / 2.83465).toFixed(1),
               height_mm: +(height / 2.83465).toFixed(1) }
    })

    return NextResponse.json({
      totalPages: pages.length,
      pages: info,
      note: 'PDF cru salvo em template/Testes/debug-raw.pdf — abra para ver se as faixas vermelha/azul aparecem dentro da página ou saem por fora',
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[test-pdf]', err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

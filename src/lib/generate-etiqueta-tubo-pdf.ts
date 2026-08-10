import 'server-only'
import { launchBrowser } from './chromium'
import type { EtiquetaTuboData } from './lab-tubos'

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// Uma única impressora térmica, rolo 10x15cm, compartilhada com a etiqueta de
// postagem do Melhor Envio (Fase 4) — decisão do Lucas. As etiquetas de tubo
// são pequenas demais pra ocupar a folha inteira, então cada folha 10x15 traz
// várias faixas de tubo empilhadas, com linha de corte tracejada + tesoura
// entre elas, no tamanho certo pra colar ao redor de um tubo de coleta.
const PAGE_WIDTH_MM  = 100
const PAGE_HEIGHT_MM = 150
const MARGIN_MM      = 5
const LABEL_HEIGHT_MM = 18
const GAP_MM          = 2
const LABELS_POR_FOLHA = Math.floor(
  (PAGE_HEIGHT_MM - 2 * MARGIN_MM + GAP_MM) / (LABEL_HEIGHT_MM + GAP_MM),
)

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

export async function generateEtiquetasTuboPDF(etiquetas: EtiquetaTuboData[]): Promise<Buffer> {
  const folhas = chunk(etiquetas, LABELS_POR_FOLHA)

  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    * { box-sizing: border-box; font-family: Arial, sans-serif; }
    body { margin: 0; }
    .folha { width: ${PAGE_WIDTH_MM}mm; height: ${PAGE_HEIGHT_MM}mm; padding: ${MARGIN_MM}mm; page-break-after: always; }
    .folha:last-child { page-break-after: auto; }
    .etiqueta { width: 100%; height: ${LABEL_HEIGHT_MM}mm; overflow: hidden; padding: 1.5mm 2mm; }
    .pedido  { font-size: 8pt; font-weight: bold; }
    .quem    { font-size: 7.5pt; }
    .exames  { font-size: 6.5pt; margin-top: 0.5mm; line-height: 1.15; max-height: 7mm; overflow: hidden; }
    .corte   { position: relative; height: 0; border-top: 1px dashed #999; margin: ${GAP_MM}mm 0; }
    .corte::before { content: '✂ corte aqui'; position: absolute; left: 0; top: -2.2mm; font-size: 5.5pt; color: #999; background: #fff; padding-right: 2mm; }
  </style></head><body>
    ${folhas.map(folha => `
      <div class="folha">
        ${folha.map((e, i) => `
          <div class="etiqueta">
            <div class="pedido">Pedido #${e.pedidoId} — ${esc(e.corTubo ?? '—')} (${e.numero}/${e.totalGrupo})</div>
            <div class="quem">${esc(e.tutorNome)} · 🐾 ${esc(e.petNome)}</div>
            <div class="exames">${e.exames.map(esc).join(', ')}</div>
          </div>
          ${i < folha.length - 1 ? '<div class="corte"></div>' : ''}
        `).join('\n')}
      </div>
    `).join('\n')}
  </body></html>`

  const browser = await launchBrowser()
  try {
    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30_000 })
    const pdf = await page.pdf({
      width:           `${PAGE_WIDTH_MM}mm`,
      height:          `${PAGE_HEIGHT_MM}mm`,
      printBackground: true,
      margin:          { top: '0', right: '0', bottom: '0', left: '0' },
    })
    return Buffer.from(pdf)
  } finally {
    await browser.close()
  }
}

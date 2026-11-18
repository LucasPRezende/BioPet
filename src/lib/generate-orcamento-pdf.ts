import 'server-only'
import fs from 'fs'
import path from 'path'
import { launchBrowser } from './chromium'
import type { Orcamento } from './orcamento'

export interface OrcamentoPDFData {
  paciente: string
  emissao: string   // YYYY-MM-DD
  validade: string  // YYYY-MM-DD
  validade_dias: number
  orcamento: Orcamento
}

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

function dataCurta(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

/** Reaproveita o visual do recibo (CSS, cabeçalho com logo) para manter a identidade da clínica. */
export async function generateOrcamentoPDF(data: OrcamentoPDFData): Promise<Buffer> {
  const base = fs.readFileSync(path.join(process.cwd(), 'template', 'Recibo.html'), 'utf-8')
  const style = base.match(/<style>[\s\S]*?<\/style>/)?.[0] ?? ''
  const fonts = base.match(/<link[^>]*fonts[^>]*>/g)?.join('\n') ?? ''

  const logoPath = path.join(process.cwd(), 'template', 'assets', 'logo-full.png')
  let logo = ''
  try { logo = `<img class="logo-full" src="data:image/png;base64,${fs.readFileSync(logoPath).toString('base64')}" />` } catch { /* sem logo */ }

  const { orcamento: o } = data
  const temEspecial = !!o.total_especial

  const linhas = o.linhas.map(l => `
    <tr>
      <td>${esc(l.nome)}${l.varia_por_horario ? ' <span class="nota-h">*</span>' : ''}</td>
      <td class="num">${esc(brl(l.pix))}</td>
      <td class="num">${esc(brl(l.cartao))}</td>
    </tr>`).join('')

  const notaEspecial = temEspecial && o.total_especial ? `
    <p class="nota">
      * Valores para atendimento em horário comercial (segunda a sexta, das 9h às 16h30).
      Fora do horário comercial, feriados e fins de semana o total é de
      <b>${esc(brl(o.total_especial.pix))}</b> no PIX ou <b>${esc(brl(o.total_especial.cartao))}</b> no cartão.
    </p>` : ''

  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8" />
${fonts}
${style}
<style>
  .page{ min-height: 297mm; }
  table.orc{ width:100%; border-collapse:collapse; margin-top:4mm; }
  table.orc th{ text-align:left; font-size:8pt; letter-spacing:1.5px; text-transform:uppercase;
                color:var(--teal); font-weight:600; padding:2mm 4mm; border-bottom:1.5px solid var(--gold); }
  table.orc th.num, table.orc td.num{ text-align:right; }
  table.orc td{ font-size:11pt; font-weight:500; padding:2.5mm 4mm; border-bottom:1px solid var(--line); }
  table.orc tbody tr:nth-child(even){ background:#FBF9F3; }
  table.orc td.num{ font-family:'JetBrains Mono', monospace; font-size:10.5pt; white-space:nowrap; }
  table.orc tfoot td{ font-weight:700; border-top:1.5px solid var(--gold); border-bottom:none; background:var(--gold-soft); }
  .nota{ font-size:9pt; color:var(--muted); line-height:1.6; margin-top:5mm; }
  .nota-h{ color:var(--gold); font-weight:700; }
  .validade{ margin-top:7mm; border:1.5px solid var(--gold); padding:3.5mm 6mm; max-width:110mm; font-size:11pt; }
  .validade b{ font-weight:700; }
  .cartao-nota{ font-size:8.5pt; color:var(--muted); margin-top:2mm; }
</style></head><body>
<div class="page">
  <div class="header">${logo}</div>

  <div class="doc-title-bar">
    <h1>Orçamento</h1>
    <span class="subtitle">Emitido em ${esc(dataCurta(data.emissao))}</span>
  </div>

  <section class="info-grid" style="margin-top:6mm; grid-template-columns:1fr;">
    <div class="info-card">
      <div class="label">Paciente</div>
      <dl><dt>Nome</dt><dd>${esc(data.paciente)}</dd></dl>
    </div>
  </section>

  <div class="section-head"><h2>Exames</h2><div class="rule"></div><span class="tag">Valores</span></div>

  <table class="orc">
    <thead><tr><th>Descrição do exame</th><th class="num">PIX</th><th class="num">Cartão</th></tr></thead>
    <tbody>${linhas}</tbody>
    <tfoot><tr><td>Total</td><td class="num">${esc(brl(o.total_pix))}</td><td class="num">${esc(brl(o.total_cartao))}</td></tr></tfoot>
  </table>
  <div class="cartao-nota">Cartão: valor total, parcelável em até 3x sem juros.</div>
  ${notaEspecial}

  <div class="validade">Orçamento válido por <b>${data.validade_dias} dias</b>, até <b>${esc(dataCurta(data.validade))}</b>.</div>
</div>
</body></html>`

  const browser = await launchBrowser()
  try {
    const page = await browser.newPage()
    await page.setViewport({ width: 1240, height: 1754, deviceScaleFactor: 2 })
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30_000 })
    const pdf = await page.pdf({
      format: 'A4', printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    })
    return Buffer.from(pdf)
  } finally {
    await browser.close()
  }
}

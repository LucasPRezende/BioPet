import 'server-only'
import { PDFDocument, StandardFonts, rgb, PDFPage, PDFFont } from 'pdf-lib'
import { parse as parseHtml } from 'node-html-parser'
import type { HTMLElement as ParsedEl } from 'node-html-parser'
import fs from 'fs'
import path from 'path'

// ── Cores BioPet ─────────────────────────────────────────────────────────────
const C_BLUE    = rgb(25 / 255,  32 / 255,  45 / 255)
const C_GOLD    = rgb(138 / 255, 110 / 255, 54 / 255)
const C_GOLDMID = rgb(196 / 255, 163 / 255, 90 / 255)
const C_WHITE   = rgb(1, 1, 1)
const C_BODY    = rgb(0.08, 0.08, 0.10)
const C_MUTED   = rgb(0.45, 0.45, 0.45)
const C_BORDER  = rgb(0.78, 0.70, 0.53)
const C_BG_CARD = rgb(0.975, 0.965, 0.940)

// ── Dimensões A4 ─────────────────────────────────────────────────────────────
const PW = 595.28
const PH = 841.89
const MG = 48
const CW = PW - 2 * MG
const HEADER_H  = 78
const FOOTER_H  = 42
const USABLE_TOP = PH - HEADER_H - 10
const USABLE_BOT = FOOTER_H + 10

export interface LaudoFormData {
  animal: string; especie: string; proprietario: string
  sexo: string;   raca: string;    medico_responsavel: string
  idade: string;  data: string;    texto: string
}

// ── Tipos internos de bloco para o PDF ───────────────────────────────────────
type FontKey = 'reg' | 'bold' | 'italic' | 'boldItalic'

interface Segment { text: string; font: FontKey }

interface Block {
  segments:    Segment[]
  fontSize:    number
  lineHeight:  number
  indent:      number    // recuo em pontos
  prefix:      string    // "• ", "1. ", ""
  spaceBefore: number
  spaceAfter:  number
}

interface TableRow { cells: string[]; isHeader: boolean }

interface TableBlock {
  type:        'table'
  rows:        TableRow[]
  colWidths:   number[]   // absolute px for each column
  spaceBefore: number
  spaceAfter:  number
}

type AnyBlock = Block | TableBlock

// ── Parser HTML → Blocos ─────────────────────────────────────────────────────
function parseInline(node: ParsedEl, bold = false, italic = false): Segment[] {
  const segs: Segment[] = []
  for (const child of node.childNodes) {
    if (child.nodeType === 3) {
      const text = (child as unknown as { text: string }).text.replace(/[\r\n\t]+/g, ' ')
      if (text) {
        const font: FontKey =
          bold && italic ? 'boldItalic' : bold ? 'bold' : italic ? 'italic' : 'reg'
        segs.push({ text, font })
      }
    } else {
      const el = child as ParsedEl
      const tag = el.tagName?.toLowerCase() ?? ''
      segs.push(...parseInline(
        el,
        bold || ['strong', 'b'].includes(tag),
        italic || ['em', 'i'].includes(tag),
      ))
    }
  }
  return segs
}

function htmlToBlocks(html: string): AnyBlock[] {
  const blocks: AnyBlock[] = []
  const root = parseHtml(html)

  function walkTableRows(node: ParsedEl): TableRow[] {
    const rows: TableRow[] = []
    for (const child of node.childNodes) {
      if (child.nodeType !== 1) continue
      const el  = child as ParsedEl
      const tag = el.tagName?.toLowerCase() ?? ''
      if (tag === 'tr') {
        const cells: string[] = []
        let isHeader = false
        for (const cell of el.childNodes) {
          if (cell.nodeType !== 1) continue
          const cellEl  = cell as ParsedEl
          const cellTag = cellEl.tagName?.toLowerCase()
          if (cellTag === 'td' || cellTag === 'th') {
            cells.push(cellEl.text.replace(/\s+/g, ' ').trim())
            if (cellTag === 'th') isHeader = true
          }
        }
        if (cells.length > 0) rows.push({ cells, isHeader })
      } else {
        rows.push(...walkTableRows(el))
      }
    }
    return rows
  }

  function walk(node: ParsedEl) {
    for (const child of node.childNodes) {
      if (child.nodeType !== 1) continue
      const el   = child as ParsedEl
      const tag  = el.tagName?.toLowerCase() ?? ''

      if (tag === 'p') {
        blocks.push({
          segments: parseInline(el),
          fontSize: 10.5, lineHeight: 16.5, indent: 0, prefix: '',
          spaceBefore: 0, spaceAfter: 5,
        })
      } else if (tag === 'h2') {
        blocks.push({
          segments: parseInline(el, true),
          fontSize: 13, lineHeight: 20, indent: 0, prefix: '',
          spaceBefore: 8, spaceAfter: 4,
        })
      } else if (tag === 'h3') {
        blocks.push({
          segments: parseInline(el, true),
          fontSize: 11, lineHeight: 17, indent: 0, prefix: '',
          spaceBefore: 6, spaceAfter: 3,
        })
      } else if (tag === 'ul') {
        const lis = el.childNodes.filter(n => n.nodeType === 1 && (n as ParsedEl).tagName?.toLowerCase() === 'li') as ParsedEl[]
        for (const li of lis) {
          blocks.push({
            segments: parseInline(li),
            fontSize: 10.5, lineHeight: 16, indent: 18, prefix: '• ',
            spaceBefore: 0, spaceAfter: 3,
          })
        }
      } else if (tag === 'ol') {
        const lis = el.childNodes.filter(n => n.nodeType === 1 && (n as ParsedEl).tagName?.toLowerCase() === 'li') as ParsedEl[]
        let idx = 1
        for (const li of lis) {
          blocks.push({
            segments: parseInline(li),
            fontSize: 10.5, lineHeight: 16, indent: 20, prefix: `${idx++}. `,
            spaceBefore: 0, spaceAfter: 3,
          })
        }
      } else if (tag === 'table') {
        const rows = walkTableRows(el)
        if (rows.length === 0) continue
        const maxCols  = Math.max(...rows.map(r => r.cells.length))
        // Column widths for biochemistry table (4 cols: name, result, unit, status)
        const colWidths = maxCols === 4
          ? [CW * 0.42, CW * 0.20, CW * 0.20, CW * 0.18]
          : Array(maxCols).fill(CW / maxCols)
        blocks.push({
          type: 'table', rows, colWidths,
          spaceBefore: 6, spaceAfter: 8,
        })
      } else {
        walk(el)
      }
    }
  }

  walk(root)
  return blocks
}

// ── Quebra de linha com formatação inline ─────────────────────────────────────
interface Token { text: string; font: FontKey }

function layoutBlock(
  block: Block,
  fonts: Record<FontKey, PDFFont>,
  maxW: number,
): Token[][] {
  const tokens: Token[] = []

  for (const seg of block.segments) {
    const words = seg.text.split(/(\s+)/)
    for (const w of words) {
      if (w) tokens.push({ text: w, font: seg.font })
    }
  }

  const lines: Token[][] = []
  let line: Token[] = []
  const prefixW = block.prefix ? fonts.reg.widthOfTextAtSize(block.prefix, block.fontSize) : 0
  let curW = block.indent + prefixW

  for (const tok of tokens) {
    const tw = fonts[tok.font].widthOfTextAtSize(tok.text, block.fontSize)
    const isSpace = /^\s+$/.test(tok.text)

    if (!isSpace && curW + tw > maxW && line.length > 0) {
      // trim trailing spaces
      while (line.length && /^\s+$/.test(line[line.length - 1].text)) line.pop()
      lines.push(line)
      line = [tok]
      curW = block.indent + tw
    } else {
      line.push(tok)
      curW += tw
    }
  }
  if (line.length) {
    while (line.length && /^\s+$/.test(line[line.length - 1].text)) line.pop()
    lines.push(line)
  }
  if (!lines.length) lines.push([]) // parágrafo vazio

  return lines
}

// ── Gerador principal ─────────────────────────────────────────────────────────
export async function generateLaudoPDF(
  data: LaudoFormData,
  imagensBuffers: Buffer[],
): Promise<Buffer> {
  const doc = await PDFDocument.create()

  const fonts: Record<FontKey, PDFFont> = {
    reg:        await doc.embedFont(StandardFonts.Helvetica),
    bold:       await doc.embedFont(StandardFonts.HelveticaBold),
    italic:     await doc.embedFont(StandardFonts.HelveticaOblique),
    boldItalic: await doc.embedFont(StandardFonts.HelveticaBoldOblique),
  }

  let logo: Awaited<ReturnType<typeof doc.embedPng>> | null = null
  const logoPath = path.join(process.cwd(), 'public', 'logo.png')
  if (fs.existsSync(logoPath)) {
    try { logo = await doc.embedPng(fs.readFileSync(logoPath)) } catch { /* ignora */ }
  }

  // ── Header ─────────────────────────────────────────────────────────────────
  function drawHeader(page: PDFPage) {
    page.drawRectangle({ x: 0, y: PH - HEADER_H, width: PW, height: HEADER_H, color: C_BLUE })
    page.drawRectangle({ x: 0, y: PH - HEADER_H - 3, width: PW, height: 3, color: C_GOLD })

    let textX = MG
    if (logo) {
      const scale = Math.min(58 / logo.width, 58 / logo.height)
      const lw = logo.width * scale
      const lh = logo.height * scale
      page.drawImage(logo, { x: MG, y: PH - HEADER_H / 2 - lh / 2, width: lw, height: lh })
      textX = MG + lw + 10
    }
    page.drawText('BioPet', { x: textX, y: PH - HEADER_H / 2 + 6, font: fonts.bold, size: 22, color: C_WHITE })
    page.drawText('Medicina Veterinária', {
      x: textX, y: PH - HEADER_H / 2 - 10,
      font: fonts.reg, size: 8.5,
      color: rgb(C_GOLDMID.red, C_GOLDMID.green, C_GOLDMID.blue),
    })
  }

  // ── Footer ──────────────────────────────────────────────────────────────────
  function drawFooter(page: PDFPage) {
    page.drawRectangle({ x: 0, y: FOOTER_H - 2, width: PW, height: 2, color: C_GOLD })
    const txt = 'Luciana Pereira de Brites  •  Médica Veterinária  •  CRMV - 12923'
    const tw  = fonts.italic.widthOfTextAtSize(txt, 8)
    page.drawText(txt, {
      x: (PW - tw) / 2, y: FOOTER_H - 18,
      font: fonts.italic, size: 8, color: C_GOLD,
    })
  }

  // ── Ficha do paciente ───────────────────────────────────────────────────────
  function drawPatientCard(page: PDFPage, startY: number): number {
    const BOX_H = 120
    const boxY  = startY - BOX_H
    page.drawRectangle({ x: MG, y: boxY, width: CW, height: BOX_H, color: C_BG_CARD })
    page.drawRectangle({ x: MG, y: startY - 3, width: CW, height: 3, color: C_GOLD })
    page.drawRectangle({ x: MG, y: boxY, width: CW, height: BOX_H, borderColor: C_BORDER, borderWidth: 0.6 })

    const COL3 = CW / 3
    const COL2 = CW / 2
    const PAD  = 9

    function field(label: string, value: string, x: number, y: number) {
      page.drawText(label.toUpperCase(), { x, y, font: fonts.bold, size: 6.5, color: C_GOLD })
      page.drawText(value || '—', { x, y: y - 14, font: fonts.reg, size: 9.5, color: C_BODY })
    }
    function hline(y: number) {
      page.drawLine({ start: { x: MG + PAD, y }, end: { x: MG + CW - PAD, y }, thickness: 0.4, color: C_BORDER })
    }

    const r1 = startY - 20
    field('Animal',       data.animal,       MG + PAD,            r1)
    field('Espécie',      data.especie,      MG + PAD + COL3,      r1)
    field('Proprietário', data.proprietario, MG + PAD + COL3 * 2,  r1)
    hline(startY - 42)

    const r2 = startY - 52
    field('Sexo',  data.sexo,  MG + PAD,           r2)
    field('Raça',  data.raca,  MG + PAD + COL3,     r2)
    field('Médico Veterinário Responsável', data.medico_responsavel, MG + PAD + COL3 * 2, r2)
    hline(startY - 76)

    const r3 = startY - 86
    field('Idade', data.idade, MG + PAD,        r3)
    field('Data',  data.data,  MG + PAD + COL2, r3)

    return boxY - 14
  }

  // ── Renderiza tabela no PDF ────────────────────────────────────────────────
  function drawTableBlock(
    page: PDFPage, block: TableBlock, startY: number,
  ): [PDFPage, number] {
    let curPage = page
    let curY    = startY - block.spaceBefore

    const ROW_H    = 17
    const CELL_PAD = 5
    const FS       = 9

    for (const row of block.rows) {
      if (curY - ROW_H < USABLE_BOT) {
        curPage = doc.addPage([PW, PH])
        drawHeader(curPage)
        drawFooter(curPage)
        curY = USABLE_TOP
      }

      // Background: header rows get gold tint, odd data rows get light grey
      const rowIndex = block.rows.indexOf(row)
      if (row.isHeader) {
        curPage.drawRectangle({
          x: MG, y: curY - ROW_H + 3,
          width: CW, height: ROW_H,
          color: C_BG_CARD,
        })
      } else if (rowIndex % 2 === 0) {
        curPage.drawRectangle({
          x: MG, y: curY - ROW_H + 3,
          width: CW, height: ROW_H,
          color: rgb(0.98, 0.98, 0.98),
        })
      }

      // Draw cells
      let cellX = MG
      for (let i = 0; i < row.cells.length; i++) {
        const text = row.cells[i] ?? ''
        if (text) {
          curPage.drawText(text, {
            x: cellX + CELL_PAD,
            y: curY - ROW_H + 6,
            font: row.isHeader ? fonts.bold : fonts.reg,
            size: FS,
            color: C_BODY,
            maxWidth: (block.colWidths[i] ?? CW) - CELL_PAD * 2,
          })
        }
        cellX += block.colWidths[i] ?? CW
      }

      // Bottom border
      curPage.drawLine({
        start: { x: MG, y: curY - ROW_H + 3 },
        end:   { x: MG + CW, y: curY - ROW_H + 3 },
        thickness: 0.4,
        color: C_BORDER,
      })

      curY -= ROW_H
    }

    return [curPage, curY - block.spaceAfter]
  }

  // ── Renderiza bloco no PDF, retornando [página atual, Y atual] ────────────
  function drawBlock(
    page: PDFPage, block: Block, startY: number,
  ): [PDFPage, number] {
    let curPage = page
    let curY    = startY - block.spaceBefore

    const lines = layoutBlock(block, fonts, CW - block.indent)

    for (let li = 0; li < lines.length; li++) {
      if (curY < USABLE_BOT + block.lineHeight) {
        curPage = doc.addPage([PW, PH])
        drawHeader(curPage)
        drawFooter(curPage)
        curY = USABLE_TOP
      }

      let curX = MG + block.indent

      // Prefixo (bullet/número) na primeira linha
      if (li === 0 && block.prefix) {
        const pw = fonts.reg.widthOfTextAtSize(block.prefix, block.fontSize)
        curPage.drawText(block.prefix, {
          x: MG + block.indent - pw, y: curY,
          font: fonts.reg, size: block.fontSize, color: C_BODY,
        })
      }

      // Tokens da linha
      for (const tok of lines[li]) {
        const font = fonts[tok.font]
        curPage.drawText(tok.text, { x: curX, y: curY, font, size: block.fontSize, color: C_BODY })
        curX += font.widthOfTextAtSize(tok.text, block.fontSize)
      }

      curY -= block.lineHeight
    }

    return [curPage, curY - block.spaceAfter]
  }

  // ── Página 1 ───────────────────────────────────────────────────────────────
  let page = doc.addPage([PW, PH])
  drawHeader(page)
  drawFooter(page)

  let curY = USABLE_TOP - 5
  curY = drawPatientCard(page, curY)

  // Título "LAUDO"
  page.drawText('LAUDO', { x: MG, y: curY, font: fonts.bold, size: 13, color: C_BLUE })
  page.drawRectangle({ x: MG, y: curY - 5, width: 48, height: 2.5, color: C_GOLD })
  curY -= 22

  // ── Texto do laudo (HTML → blocos) ────────────────────────────────────────
  const blocks = htmlToBlocks(data.texto)
  for (const block of blocks) {
    if ('type' in block && block.type === 'table') {
      ;[page, curY] = drawTableBlock(page, block as TableBlock, curY)
    } else {
      ;[page, curY] = drawBlock(page, block as Block, curY)
    }
  }

  // ── Imagens ────────────────────────────────────────────────────────────────
  for (const imgBuf of imagensBuffers) {
    page = doc.addPage([PW, PH])
    drawHeader(page)
    drawFooter(page)

    const areaH = PH - HEADER_H - FOOTER_H - 24
    try {
      let img
      try { img = await doc.embedPng(imgBuf) } catch { img = await doc.embedJpg(imgBuf) }

      let { width: iw, height: ih } = img
      if (iw > CW)   { ih = (ih * CW)   / iw; iw = CW   }
      if (ih > areaH) { iw = (iw * areaH) / ih; ih = areaH }

      page.drawImage(img, {
        x: MG + (CW - iw) / 2,
        y: FOOTER_H + 4 + (areaH - ih) / 2,
        width: iw, height: ih,
      })
    } catch {
      page.drawText('[ Imagem não pôde ser carregada ]', {
        x: MG, y: PH / 2, font: fonts.reg, size: 10, color: C_MUTED,
      })
    }
  }

  return Buffer.from(await doc.save())
}

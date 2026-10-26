import 'server-only'
import { PDFDocument, PDFName, PDFRawStream } from 'pdf-lib'
import { launchBrowser } from './chromium'

// Curva de amplificação do relatório do equipamento (Bioguard), para o laudo.
//
// O relatório é um PDF de uma página que é UMA imagem JPEG (4000×5600). Os
// pontos da curva não existem como dado — só desenhados. Então a curva vai para
// o laudo como recorte da imagem original (nada redesenhado/estimado).
//
// O recorte é por posição fixa: o layout do relatório é sempre o mesmo e o
// gráfico fica acima da tabela de resultados, então não muda de lugar com o
// número de alvos. Se o equipamento mudar o layout, ajustar RECORTE.

/** Região do gráfico (eixos + rótulos), em fração da página. */
export const RECORTE = { x0: 0.176, y0: 0.2882, x1: 0.880, y1: 0.5390 }

/** JPEG da página do relatório. PDF → a imagem embutida; JPEG/PNG → o próprio arquivo. */
export async function imagemDoRelatorio(arquivo: Buffer, mimeType: string): Promise<{ dados: Buffer; mime: string } | null> {
  if (mimeType.startsWith('image/')) return { dados: arquivo, mime: mimeType }
  const doc = await PDFDocument.load(arquivo, { ignoreEncryption: true })
  let maior: { dados: Buffer; area: number } | null = null
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream)) continue
    const d = obj.dict
    if (String(d.get(PDFName.of('Subtype'))) !== '/Image') continue
    if (String(d.get(PDFName.of('Filter'))) !== '/DCTDecode') continue  // só JPEG puro
    const area = Number(String(d.get(PDFName.of('Width')))) * Number(String(d.get(PDFName.of('Height'))))
    if (!maior || area > maior.area) maior = { dados: Buffer.from(obj.contents), area }
  }
  return maior ? { dados: maior.dados, mime: 'image/jpeg' } : null
}

/** Recorta o gráfico da imagem da página. Devolve um data URL JPEG. */
export async function recortarCurva(img: { dados: Buffer; mime: string }, largura = 1400): Promise<string> {
  const browser = await launchBrowser()
  try {
    const page = await browser.newPage()
    await page.setContent('<canvas id="c"></canvas>')
    return await page.evaluate(async (src: string, r: typeof RECORTE, largura: number) => {
      const im = new Image()
      im.src = src
      await im.decode()
      const sx = im.naturalWidth * r.x0, sy = im.naturalHeight * r.y0
      const sw = im.naturalWidth * (r.x1 - r.x0), sh = im.naturalHeight * (r.y1 - r.y0)
      const c = document.getElementById('c') as HTMLCanvasElement
      c.width = largura
      c.height = Math.round(largura * sh / sw)
      const ctx = c.getContext('2d')!
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(im, sx, sy, sw, sh, 0, 0, c.width, c.height)
      return c.toDataURL('image/jpeg', 0.9)
    }, `data:${img.mime};base64,${img.dados.toString('base64')}`, RECORTE, largura)
  } finally {
    await browser.close()
  }
}

/** Curva pronta para o laudo, ou null se o arquivo não tiver a imagem esperada. */
export async function curvaDoRelatorio(arquivo: Buffer, mimeType: string): Promise<string | null> {
  const img = await imagemDoRelatorio(arquivo, mimeType)
  return img ? recortarCurva(img) : null
}

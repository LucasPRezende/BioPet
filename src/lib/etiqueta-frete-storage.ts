import 'server-only'
import { promises as fs } from 'fs'
import path from 'path'

const STORAGE_DIR = path.join(process.cwd(), 'storage', 'etiquetas-frete')

async function ensureDir() {
  await fs.mkdir(STORAGE_DIR, { recursive: true })
}

function nomeArquivo(pedidoId: number, laboratorioId: number): string {
  return `pedido-${pedidoId}-lab-${laboratorioId}.pdf`
}

export async function salvarEtiquetaFrete(pedidoId: number, laboratorioId: number, buffer: Buffer): Promise<string> {
  await ensureDir()
  await fs.writeFile(path.join(STORAGE_DIR, nomeArquivo(pedidoId, laboratorioId)), buffer)
  return nomeArquivo(pedidoId, laboratorioId)
}

export async function lerEtiquetaFrete(pedidoId: number, laboratorioId: number): Promise<Buffer | null> {
  try {
    return await fs.readFile(path.join(STORAGE_DIR, nomeArquivo(pedidoId, laboratorioId)))
  } catch {
    return null
  }
}

import { promises as fs } from 'fs'
import path from 'path'

const STORAGE_DIR = path.join(process.cwd(), 'storage', 'laudos')

async function ensureStorageDir() {
  await fs.mkdir(STORAGE_DIR, { recursive: true })
}

function getFilePath(filename: string) {
  return path.join(STORAGE_DIR, filename)
}

export async function savePdf(filename: string, buffer: Buffer) {
  await ensureStorageDir()
  await fs.writeFile(getFilePath(filename), buffer)
}

export async function replacePdf(filename: string, buffer: Buffer) {
  await ensureStorageDir()
  await fs.writeFile(getFilePath(filename), buffer)
}

export async function deletePdf(filename: string) {
  try {
    await fs.unlink(getFilePath(filename))
  } catch {
    // ignora se não existir
  }
}

export async function readPdf(filename: string): Promise<Buffer | null> {
  try {
    return await fs.readFile(getFilePath(filename))
  } catch {
    return null
  }
}

export function getPdfPublicUrl(token: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'https://biopetvet.com'
  return `${base}/api/pdf/${token}`
}

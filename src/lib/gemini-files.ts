import { GoogleAIFileManager } from '@google/generative-ai/server'
import fs from 'fs'
import path from 'path'

const CONTEXT_DIR = path.join(process.cwd(), 'context-pdfs')
const CACHE_FILE  = path.join(CONTEXT_DIR, '.gemini-cache.json')

type CacheEntry = { uri: string; expiresAt: string }
type Cache = Record<string, CacheEntry>

function readCache(): Cache {
  try { return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8')) } catch { return {} }
}

function writeCache(cache: Cache) {
  try { fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2)) } catch {}
}

async function uploadPdf(manager: GoogleAIFileManager, filePath: string, displayName: string) {
  const upload = await manager.uploadFile(filePath, {
    mimeType: 'application/pdf',
    displayName,
  })
  return upload.file.uri
}

/** Limpa o cache de um arquivo específico (força re-upload na próxima chamada) */
export function invalidateCache(pdf?: string) {
  const cache = readCache()
  if (pdf) {
    delete cache[pdf]
  } else {
    Object.keys(cache).forEach(k => delete cache[k])
  }
  writeCache(cache)
}

export async function getContextFiles(apiKey: string, forceReupload = false): Promise<{ fileUri: string; mimeType: string }[]> {
  if (forceReupload) invalidateCache()
  if (!fs.existsSync(CONTEXT_DIR)) return []

  const pdfs = fs.readdirSync(CONTEXT_DIR).filter(f => f.toLowerCase().endsWith('.pdf'))
  if (pdfs.length === 0) return []

  const cache   = readCache()
  const manager = new GoogleAIFileManager(apiKey)
  const result: { fileUri: string; mimeType: string }[] = []
  let dirty = false

  for (const pdf of pdfs) {
    const filePath = path.join(CONTEXT_DIR, pdf)
    const entry    = cache[pdf]

    // URI válida: ainda tem mais de 1h de vida (margem segura)
    if (entry && new Date(entry.expiresAt).getTime() - Date.now() > 60 * 60 * 1000) {
      result.push({ fileUri: entry.uri, mimeType: 'application/pdf' })
      continue
    }

    // Upload (novo ou expirado)
    try {
      const uri       = await uploadPdf(manager, filePath, pdf)
      const expiresAt = new Date(Date.now() + 47 * 60 * 60 * 1000).toISOString() // 47h
      cache[pdf]      = { uri, expiresAt }
      dirty           = true
      result.push({ fileUri: uri, mimeType: 'application/pdf' })
    } catch (err) {
      console.error(`[Gemini Files] Erro ao fazer upload de ${pdf}:`, err)
    }
  }

  if (dirty) writeCache(cache)
  return result
}

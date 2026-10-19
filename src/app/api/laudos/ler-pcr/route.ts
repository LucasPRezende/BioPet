import { NextRequest, NextResponse } from 'next/server'
import { parseSystemSession, SESSION_COOKIE_NAME } from '@/lib/system-auth'
import { lerRelatorioPcr } from '@/lib/parse-pcr-pdf'
import { curvaDoRelatorio } from '@/lib/pcr-curva'

// Leitura pode levar ~30s no modelo Pro.
export const maxDuration = 120

const MAX_BYTES = 15 * 1024 * 1024

// POST (multipart, campo "file") — lê o relatório de PCR do equipamento e
// devolve os dados brutos para a tela conferir. Não salva nada.
export async function POST(request: NextRequest) {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (!cookie) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  const session = await parseSystemSession(cookie)
  if (!session) return NextResponse.json({ error: 'Sessão inválida.' }, { status: 401 })

  const form = await request.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: 'Envie o PDF do relatório.' }, { status: 400 })
  if (file.size > MAX_BYTES)   return NextResponse.json({ error: 'Arquivo muito grande (máx. 15 MB).' }, { status: 400 })

  const tipo = file.type || 'application/pdf'
  if (tipo !== 'application/pdf' && !tipo.startsWith('image/')) {
    return NextResponse.json({ error: 'Envie o PDF (ou uma foto) do relatório do equipamento.' }, { status: 400 })
  }

  try {
    const arquivo = Buffer.from(await file.arrayBuffer())
    // Leitura (Gemini) e recorte da curva em paralelo. Falha no recorte não
    // impede o laudo: só sai sem a curva.
    const [dados, curva] = await Promise.all([
      lerRelatorioPcr(arquivo, tipo),
      curvaDoRelatorio(arquivo, tipo).catch(err => {
        console.error('[ler-pcr] curva:', err)
        return null
      }),
    ])
    if (dados.alvos.length === 0) {
      return NextResponse.json({ error: 'Não encontrei nenhum teste com Ct no relatório. Confira o arquivo ou preencha à mão.' }, { status: 422 })
    }
    return NextResponse.json({ ...dados, curva })
  } catch (err) {
    console.error('[ler-pcr] erro:', err)
    const msg = err instanceof Error ? err.message : 'Erro desconhecido'
    return NextResponse.json({ error: `Não consegui ler o PDF: ${msg}` }, { status: 500 })
  }
}

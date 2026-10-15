import { NextRequest, NextResponse } from 'next/server'
import { parseSystemSession, SESSION_COOKIE_NAME } from '@/lib/system-auth'
import { parseHemogramaCsv } from '@/lib/hemograma'

// Lê o CSV exportado pelo analisador hematológico e devolve as amostras.
// Não gera PDF: a tela revisa/edita os valores e pede a prévia depois.
export async function POST(request: NextRequest) {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (!cookie) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const session = await parseSystemSession(cookie)
  if (!session) return NextResponse.json({ error: 'Sessão inválida.' }, { status: 401 })

  let formData: FormData
  try { formData = await request.formData() } catch {
    return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 })
  }

  const file = formData.get('arquivo')
  if (!file || typeof file === 'string')
    return NextResponse.json({ error: 'Arquivo não enviado.' }, { status: 400 })

  const bytes = new Uint8Array(await (file as Blob).arrayBuffer())
  // O analisador exporta em UTF-8; se vier em ANSI (Latin-1), os acentos do
  // cabeçalho ("Proprietário") quebram — tenta de novo como Latin-1.
  let texto = new TextDecoder('utf-8').decode(bytes)
  if (texto.includes('�')) texto = new TextDecoder('latin1').decode(bytes)

  try {
    const amostras = parseHemogramaCsv(texto)
    if (!amostras.length)
      return NextResponse.json({ error: 'Nenhum resultado encontrado no arquivo.' }, { status: 422 })
    return NextResponse.json({ amostras })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Arquivo inválido.'
    return NextResponse.json({ error: msg }, { status: 422 })
  }
}

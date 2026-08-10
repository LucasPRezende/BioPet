import { NextRequest, NextResponse } from 'next/server'
import { parseSystemSession, SESSION_COOKIE_NAME } from '@/lib/system-auth'
import { isConectado } from '@/lib/melhor-envio'

export async function GET(request: NextRequest) {
  const cookie  = request.cookies.get(SESSION_COOKIE_NAME)?.value
  const session = cookie ? await parseSystemSession(cookie) : null
  if (!session) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const conectado = await isConectado()
  return NextResponse.json({ conectado })
}

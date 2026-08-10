import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { parseSystemSession, SESSION_COOKIE_NAME } from '@/lib/system-auth'
import { buildAuthorizeUrl } from '@/lib/melhor-envio'

// Só admin conecta a conta do Melhor Envio — é config global do sistema, não
// por usuário. Redireciona pro authorize deles com um state anti-CSRF.
export async function GET(request: NextRequest) {
  const cookie  = request.cookies.get(SESSION_COOKIE_NAME)?.value
  const session = cookie ? await parseSystemSession(cookie) : null
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })
  }

  let url: string
  try {
    const state = randomBytes(16).toString('hex')
    url = buildAuthorizeUrl(state)
    const response = NextResponse.redirect(url)
    response.cookies.set('me_oauth_state', state, {
      httpOnly: true,
      secure:   process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge:   600,
      path:     '/',
    })
    return response
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erro ao montar autorização.' }, { status: 500 })
  }
}

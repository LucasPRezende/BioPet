import { NextResponse, type NextRequest } from 'next/server'
import { parseSystemSession, SESSION_COOKIE_NAME } from './system-auth'
import { parseClinicaSession, CLINICA_COOKIE_NAME } from './clinica-auth'

export function clearCookieResponse(cookieName: string): NextResponse {
  const res = NextResponse.json({ success: true })
  res.cookies.delete(cookieName)
  return res
}

// Quem está pedindo um catálogo público (bioquímica / testes rápidos):
//   'admin'   → sessão de admin: vê tudo, inclusive os itens inativos
//   'interno' → demais usuários do sistema (equipe BioPet): vê a comissão
//   'clinica' → clínica parceira logada: vê o repasse, não a margem
//   'publico' → qualquer um na internet: só catálogo e preços de tabela
export type AudienciaCatalogo = 'admin' | 'interno' | 'clinica' | 'publico'

export async function audienciaCatalogo(request: NextRequest): Promise<AudienciaCatalogo> {
  const sys = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (sys) {
    const session = await parseSystemSession(sys)
    if (session) return session.role === 'admin' ? 'admin' : 'interno'
  }
  const cli = request.cookies.get(CLINICA_COOKIE_NAME)?.value
  if (cli && (await parseClinicaSession(cli))) return 'clinica'
  return 'publico'
}

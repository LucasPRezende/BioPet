// Mantido por compatibilidade — redireciona para as novas rotas.
// Login: POST /api/auth/login
// Logout: POST /api/auth/logout
import { NextResponse } from 'next/server'
import { SESSION_COOKIE_NAME } from '@/lib/system-auth'

export async function DELETE() {
  const response = NextResponse.json({ success: true })
  response.cookies.delete(SESSION_COOKIE_NAME)
  response.cookies.delete('session')
  return response
}

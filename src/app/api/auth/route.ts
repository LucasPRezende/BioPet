import { NextRequest, NextResponse } from 'next/server'
import { verifyPassword, getSessionToken } from '@/lib/auth'

export async function POST(request: NextRequest) {
  const { password } = await request.json()

  if (!verifyPassword(password)) {
    return NextResponse.json({ error: 'Senha incorreta' }, { status: 401 })
  }

  const response = NextResponse.json({ success: true })
  response.cookies.set('session', getSessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7, // 7 dias
    path: '/',
  })

  return response
}

export async function DELETE() {
  const response = NextResponse.json({ success: true })
  response.cookies.delete('session')
  return response
}

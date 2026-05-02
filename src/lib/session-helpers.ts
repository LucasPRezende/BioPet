import { NextResponse } from 'next/server'

export function clearCookieResponse(cookieName: string): NextResponse {
  const res = NextResponse.json({ success: true })
  res.cookies.delete(cookieName)
  return res
}

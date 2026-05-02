import { SESSION_COOKIE_NAME } from '@/lib/system-auth'
import { clearCookieResponse } from '@/lib/session-helpers'

export async function POST() {
  return clearCookieResponse(SESSION_COOKIE_NAME)
}

export async function DELETE() {
  return clearCookieResponse(SESSION_COOKIE_NAME)
}

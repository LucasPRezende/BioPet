import { NextRequest } from 'next/server'

export function verifyLaudoApiKey(request: NextRequest): boolean {
  const key = request.headers.get('x-api-key')
  return !!key && key === process.env.LAUDO_API_KEY
}

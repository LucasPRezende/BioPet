import { NextRequest } from 'next/server'

export function verifyAgentKey(request: NextRequest): boolean {
  const key = request.headers.get('x-api-key')
  return !!key && key === process.env.AGENT_API_KEY
}

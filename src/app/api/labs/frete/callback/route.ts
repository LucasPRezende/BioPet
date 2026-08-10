import { NextRequest, NextResponse } from 'next/server'
import { conectar } from '@/lib/melhor-envio'

// Recebe o `code` do Melhor Envio, troca por tokens e volta pra tela de
// pedidos com um aviso. Valida o `state` contra o cookie setado em /conectar
// pra evitar CSRF na autorização.
export async function GET(request: NextRequest) {
  const code       = request.nextUrl.searchParams.get('code')
  const state      = request.nextUrl.searchParams.get('state')
  const errorParam = request.nextUrl.searchParams.get('error')
  const stateCookie = request.cookies.get('me_oauth_state')?.value

  if (errorParam) {
    return NextResponse.json({ error: `Autorização recusada pelo Melhor Envio: ${errorParam}` }, { status: 400 })
  }
  if (!code) {
    return NextResponse.json({ error: 'Parâmetro "code" ausente no retorno do Melhor Envio.' }, { status: 400 })
  }
  if (!state || !stateCookie || state !== stateCookie) {
    return NextResponse.json({ error: 'State inválido ou expirado — tente conectar novamente.' }, { status: 400 })
  }

  try {
    await conectar(code)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erro ao conectar Melhor Envio.' }, { status: 500 })
  }

  const response = NextResponse.redirect(new URL('/admin/labs/pedidos?frete=conectado', request.url))
  response.cookies.delete('me_oauth_state')
  return response
}

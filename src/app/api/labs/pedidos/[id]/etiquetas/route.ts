import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { parseSystemSession, SESSION_COOKIE_NAME } from '@/lib/system-auth'
import { consolidarTubos, montarEtiquetas } from '@/lib/lab-tubos'
import { generateEtiquetasTuboPDF } from '@/lib/generate-etiqueta-tubo-pdf'

async function requireAuth(request: NextRequest) {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (!cookie) return null
  return parseSystemSession(cookie)
}

// PDF com uma etiqueta por tubo físico — pet, tutor, exames do tubo, nº do pedido.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth(request)
  if (!session) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const { id } = await params
  const pedidoId = parseInt(id)
  if (isNaN(pedidoId)) return NextResponse.json({ error: 'ID inválido.' }, { status: 400 })

  const { data: pedido, error: errPedido } = await supabase
    .from('pedido_lab')
    .select('id, tutores(nome), pets(nome), pedido_lab_item(nome, cor_tubo, material_tipo, material_volume_ml)')
    .eq('id', pedidoId)
    .single()

  if (errPedido || !pedido) return NextResponse.json({ error: 'Pedido não encontrado.' }, { status: 404 })

  const tutor     = Array.isArray(pedido.tutores) ? pedido.tutores[0] : pedido.tutores
  const pet       = Array.isArray(pedido.pets)    ? pedido.pets[0]    : pedido.pets
  const tutorNome = tutor?.nome ?? '—'
  const petNome   = pet?.nome   ?? '—'

  const grupos    = consolidarTubos(pedido.pedido_lab_item)
  const etiquetas = montarEtiquetas(grupos, { pedidoId, tutorNome, petNome })

  if (etiquetas.length === 0) return NextResponse.json({ error: 'Nada para etiquetar.' }, { status: 404 })

  const pdf = await generateEtiquetasTuboPDF(etiquetas)
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      'Content-Type':        'application/pdf',
      'Content-Disposition': `inline; filename="etiquetas-pedido-${pedidoId}.pdf"`,
    },
  })
}

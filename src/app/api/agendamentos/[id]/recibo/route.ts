import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { parseSystemSession, SESSION_COOKIE_NAME } from '@/lib/system-auth'
import { generateReciboPDF } from '@/lib/generate-recibo-pdf'

export const maxDuration = 60

function sanitizeFilename(s: string): string {
  return s.replace(/[<>:"/\\|?*\x00-\x1f]/g, '').replace(/\s+/g, ' ').trim()
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (!cookie) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const session = await parseSystemSession(cookie)
  if (!session) return NextResponse.json({ error: 'Sessão inválida.' }, { status: 401 })

  const { data: ag, error } = await supabase
    .from('agendamentos')
    .select(`
      id, tipo_exame, data_hora, valor, forma_pagamento, status_pagamento, pagamento_responsavel,
      tutores(nome),
      pets(nome, especie, raca),
      clinicas(nome),
      agendamento_exames(tipo_exame, descricao),
      agendamento_bioquimica(id, bioquimica_exames(nome))
    `)
    .eq('id', Number(params.id))
    .single()

  if (error || !ag) return NextResponse.json({ error: 'Agendamento não encontrado.' }, { status: 404 })

  if (ag.status_pagamento !== 'pago' && ag.status_pagamento !== 'pago_clinica') {
    return NextResponse.json({ error: 'Recibo disponível apenas para agendamentos pagos.' }, { status: 400 })
  }

  const valor = Number(ag.valor ?? 0)
  if (!(valor > 0)) {
    return NextResponse.json({ error: 'Agendamento sem valor — recibo não aplicável.' }, { status: 400 })
  }

  // Supabase pode devolver relações 1:1 como objeto ou array
  const one = <T,>(v: unknown): T | null =>
    (Array.isArray(v) ? (v[0] ?? null) : (v ?? null)) as T | null
  const tutor   = one<{ nome: string | null }>(ag.tutores)
  const pet     = one<{ nome: string; especie: string | null; raca: string | null }>(ag.pets)
  const clinica = one<{ nome: string }>(ag.clinicas)

  // Quem pagou: a clínica (repasse) ou o tutor
  const isClinica = ag.status_pagamento === 'pago_clinica' || ag.pagamento_responsavel === 'clinica'
  const pagador   = (isClinica ? clinica?.nome : tutor?.nome) ?? tutor?.nome ?? clinica?.nome ?? '—'

  // Lista de exames: nome de cada exame; bioquímica detalha os sub-exames
  const bioNomes = (ag.agendamento_bioquimica ?? [])
    .map(b => one<{ nome: string }>(b.bioquimica_exames)?.nome)
    .filter((n): n is string => !!n)

  const rows = ag.agendamento_exames ?? []
  const exames: string[] = rows.length > 0
    ? rows.map(e =>
        e.tipo_exame === 'Bioquímica' && bioNomes.length > 0
          ? `Bioquímica (${bioNomes.join(', ')})`
          : e.tipo_exame,
      )
    : ag.tipo_exame.split(',').map((s: string) => s.trim()).filter(Boolean)

  try {
    const pdf = await generateReciboPDF({
      pagador,
      pet: {
        nome:    pet?.nome ?? '—',
        especie: pet?.especie ?? null,
        raca:    pet?.raca ?? null,
      },
      clinica:         clinica?.nome ?? null,
      data_exame:      ag.data_hora,
      forma_pagamento: ag.forma_pagamento,
      exames,
      valor,
    })

    const filename = sanitizeFilename(`Recibo - ${pagador} - ${pet?.nome ?? 'Pet'}.pdf`)
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'Content-Type':        'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control':       'private, no-store',
      },
    })
  } catch (e) {
    console.error('[recibo] Erro ao gerar PDF:', e)
    return NextResponse.json({ error: 'Erro ao gerar o recibo.' }, { status: 500 })
  }
}

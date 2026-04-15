import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabase } from '@/lib/supabase'
import { parseClinicaSession, CLINICA_COOKIE_NAME } from '@/lib/clinica-auth'

export async function GET(request: NextRequest) {
  const token = (await cookies()).get(CLINICA_COOKIE_NAME)?.value
  if (!token) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
  const session = await parseClinicaSession(token)
  if (!session) return NextResponse.json({ error: 'Sessão inválida.' }, { status: 401 })

  const params   = request.nextUrl.searchParams
  const data     = params.get('data')
  const duracao  = parseInt(params.get('duracao') ?? '30')
  const inicio   = params.get('inicio') ?? '08:00'
  const fim      = params.get('fim')    ?? '18:00'
  const intervalo = parseInt(params.get('intervalo') ?? '30')

  if (!data) return NextResponse.json({ error: 'Parâmetro "data" é obrigatório.' }, { status: 400 })

  // Busca agendamentos existentes no dia (exceto cancelados)
  const { data: existentes } = await supabase
    .from('agendamentos')
    .select('data_hora, duracao_minutos')
    .gte('data_hora', `${data}T00:00:00`)
    .lte('data_hora', `${data}T23:59:59`)
    .neq('status', 'cancelado')

  // Gera horários livres
  const [iH, iM] = inicio.split(':').map(Number)
  const [fH, fM] = fim.split(':').map(Number)
  const endMin   = fH * 60 + fM
  const horarios: string[] = []

  let cur = iH * 60 + iM
  while (cur + duracao <= endMin) {
    const h      = Math.floor(cur / 60)
    const m      = cur % 60
    const slotStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
    const slotIni = new Date(`${data}T${slotStr}:00`)
    const slotFim = new Date(slotIni.getTime() + duracao * 60_000)

    const conflito = (existentes ?? []).some(ag => {
      const agIni = new Date(ag.data_hora.includes('T') ? ag.data_hora : `${data}T${ag.data_hora}`)
      const agFim = new Date(agIni.getTime() + (ag.duracao_minutos ?? 30) * 60_000)
      return slotIni < agFim && slotFim > agIni
    })

    if (!conflito) horarios.push(slotStr)
    cur += intervalo
  }

  return NextResponse.json({ data, duracao_minutos: duracao, horarios_livres: horarios })
}

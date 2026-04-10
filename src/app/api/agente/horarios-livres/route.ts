import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { verifyAgentKey } from '@/lib/agent-auth'

export async function GET(request: NextRequest) {
  if (!verifyAgentKey(request)) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
  }

  const { searchParams } = request.nextUrl
  const data      = searchParams.get('data')
  const duracao   = Number(searchParams.get('duracao')   ?? 30)  // duração do novo agendamento (min)
  const inicio    = searchParams.get('inicio')   ?? '08:00'       // início do expediente
  const fim       = searchParams.get('fim')      ?? '18:00'       // fim do expediente
  const intervalo = Number(searchParams.get('intervalo') ?? 30)   // intervalo entre slots (min)

  if (!data) {
    return NextResponse.json(
      { error: 'Parâmetro "data" é obrigatório (formato: YYYY-MM-DD).' },
      { status: 400 },
    )
  }

  // Busca todos agendamentos ativos do dia
  const { data: agendamentos } = await supabase
    .from('agendamentos')
    .select('data_hora, duracao_minutos')
    .gte('data_hora', `${data}T00:00:00`)
    .lte('data_hora', `${data}T23:59:59`)
    .neq('status', 'cancelado')

  // Monta a lista de intervalos ocupados
  const ocupados = (agendamentos ?? []).map(ag => {
    const agInicio = new Date(`${data}T${ag.data_hora.split('T')[1].substring(0, 5)}`)
    const agFim    = new Date(agInicio.getTime() + (ag.duracao_minutos ?? 30) * 60_000)
    return { inicio: agInicio, fim: agFim }
  })

  // Gera slots a cada `intervalo` minutos dentro do expediente
  const [hIni, mIni] = inicio.split(':').map(Number)
  const [hFim, mFim] = fim.split(':').map(Number)

  const expedienteInicio = new Date(`${data}T00:00:00`)
  expedienteInicio.setHours(hIni, mIni, 0, 0)

  const expedienteFim = new Date(`${data}T00:00:00`)
  expedienteFim.setHours(hFim, mFim, 0, 0)

  const horarios_livres: string[] = []
  const cursor = new Date(expedienteInicio)

  while (cursor < expedienteFim) {
    const slotFim = new Date(cursor.getTime() + duracao * 60_000)

    // Slot não pode ultrapassar o fim do expediente
    if (slotFim <= expedienteFim) {
      const conflito = ocupados.some(oc => cursor < oc.fim && slotFim > oc.inicio)
      if (!conflito) {
        const hh = String(cursor.getHours()).padStart(2, '0')
        const mm = String(cursor.getMinutes()).padStart(2, '0')
        horarios_livres.push(`${hh}:${mm}`)
      }
    }

    cursor.setMinutes(cursor.getMinutes() + intervalo)
  }

  return NextResponse.json({
    data,
    duracao_minutos: duracao,
    expediente: { inicio, fim },
    total_livres: horarios_livres.length,
    horarios_livres,
  })
}

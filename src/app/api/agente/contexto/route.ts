import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { verifyAgentKey } from '@/lib/agent-auth'
import { normalizeTelefone } from '@/lib/telefone'
import { buscarRevisoesDisponiveis } from '@/lib/agente/revisoes-disponiveis'

export async function GET(request: NextRequest) {
  if (!verifyAgentKey(request)) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
  }

  const telefone = request.nextUrl.searchParams.get('telefone')

  if (!telefone) {
    return NextResponse.json({ error: 'Parâmetro "telefone" é obrigatório.' }, { status: 400 })
  }

  const digits  = telefone.replace(/\D/g, '')
  const telNorm = normalizeTelefone(digits)

  const { data: tutor } = await supabase
    .from('tutores')
    .select('id, nome, telefone, atendimento_humano, atendimento_humano_ate')
    .or(`telefone.eq.${telNorm},telefone.eq.${digits}`)
    .maybeSingle()

  if (!tutor) {
    return NextResponse.json({ tutor: null, pets: [], atendimento_humano: false })
  }

  // Auto-desbloqueio: se o prazo expirou, limpa o flag
  if (tutor.atendimento_humano && tutor.atendimento_humano_ate) {
    const expiry = new Date(tutor.atendimento_humano_ate)
    if (expiry < new Date()) {
      await supabase
        .from('tutores')
        .update({ atendimento_humano: false, atendimento_humano_ate: null })
        .eq('id', tutor.id)
      tutor.atendimento_humano = false
      tutor.atendimento_humano_ate = null
    }
  }

  const { data: pets } = await supabase
    .from('pets')
    .select('id, nome, especie, raca, sexo, falecido, falecido_em')
    .eq('tutor_id', tutor.id)
    .order('nome')

  const todosOsPets   = pets ?? []
  const petsAtivos    = todosOsPets.filter(p => !p.falecido)
  const petsFalecidos = todosOsPets.filter(p => p.falecido)

  const revisoesDisponiveis = await buscarRevisoesDisponiveis(petsAtivos.map(p => p.id))

  return NextResponse.json({
    tutor,
    pets: petsAtivos,
    pets_falecidos: petsFalecidos,
    revisoes_disponiveis: revisoesDisponiveis,
  })
}

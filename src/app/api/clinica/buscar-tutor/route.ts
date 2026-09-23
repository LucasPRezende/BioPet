import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabase } from '@/lib/supabase'
import { parseClinicaSession, CLINICA_COOKIE_NAME } from '@/lib/clinica-auth'
import { sanitizeOrTerm } from '@/lib/search-utils'
import { normalizeTelefone } from '@/lib/telefone'
// Telemetria temporária — remover junto com o bloco marcado lá embaixo.
import { registrarBusca, medirEscopoDoNome, type FormatoDaBusca } from '@/lib/telemetria-busca-tutor'

export async function GET(request: NextRequest) {
  const token = (await cookies()).get(CLINICA_COOKIE_NAME)?.value
  if (!token) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
  const session = await parseClinicaSession(token)
  if (!session) return NextResponse.json({ error: 'Sessão inválida.' }, { status: 401 })

  // Suporte a busca dinâmica por nome ou telefone (?q=) e busca direta por telefone (?telefone=)
  const q        = request.nextUrl.searchParams.get('q')?.trim() ?? ''
  const telParam = request.nextUrl.searchParams.get('telefone')?.trim() ?? ''
  const termo    = q || telParam

  if (!termo) return NextResponse.json([])

  const digits  = termo.replace(/\D/g, '')
  const telNorm = normalizeTelefone(digits)
  const isPhone = digits.length >= 8

  // Busca dinâmica — retorna lista
  if (q) {
    let query = supabase
      .from('tutores')
      .select('id, nome, telefone, cpf, pets(id, nome, especie, raca, falecido)')
      .order('nome')
      .limit(8)

    const qSafe = sanitizeOrTerm(q)
    if (isPhone) {
      const orParts = [`nome.ilike.%${qSafe}%`, `telefone.ilike.%${digits}%`, `telefone.ilike.%${telNorm}%`]
      if (digits.length === 11) orParts.push(`cpf.eq.${digits}`)
      query = query.or(orParts.join(','))
    } else {
      query = query.ilike('nome', `%${qSafe}%`)
    }

    const { data } = await query

    // ─── Telemetria temporária — REMOVER depois da decisão sobre o escopo ───
    // Não altera a resposta. Dispara solta para não atrasar a requisição.
    const formato: FormatoDaBusca = {
      clinicaId:  session.clinicaId,
      ramo:       isPhone ? 'telefone' : 'nome',
      palavras:   q.split(/\s+/).filter(Boolean).length,
      tamanho:    q.length,
      digitos:    digits.length,
      resultados: data?.length ?? 0,
    }
    if (isPhone) {
      registrarBusca(formato)
    } else {
      void medirEscopoDoNome(formato, (data ?? []).map(t => t.id))
    }
    // ────────────────────────────────────────────────────────────────────────

    // Pet falecido não pode aparecer como opção de agendamento. O filtro é aqui
    // (e não no select) porque o PostgREST não filtra linha embutida sem !inner,
    // o que esconderia o tutor que só tem pet falecido.
    const tutores = (data ?? []).map(t => {
      const { pets, ...tutor } = t as { pets?: { falecido?: boolean | null }[] }
      return { ...tutor, pets: (pets ?? []).filter(p => !p.falecido) }
    })
    return NextResponse.json(tutores)
  }

  // Busca direta por telefone — retorna { tutor, pets } (compatibilidade)
  const { data: tutor } = await supabase
    .from('tutores')
    .select('id, nome, telefone')
    .or(`telefone.eq.${telNorm},telefone.eq.${digits}`)
    .maybeSingle()

  if (!tutor) return NextResponse.json({ tutor: null, pets: [] })

  const { data: pets } = await supabase
    .from('pets')
    .select('id, nome, especie, raca')
    .eq('tutor_id', tutor.id)
    .not('falecido', 'is', true)   // a coluna é nullable: null e false continuam valendo
    .order('nome')

  return NextResponse.json({ tutor, pets: pets ?? [] })
}

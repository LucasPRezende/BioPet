import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { parseSystemSession, SESSION_COOKIE_NAME } from '@/lib/system-auth'
import { resumoEstoque } from '@/lib/estoque'

async function requireAdmin(request: NextRequest) {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (!cookie) return null
  const session = await parseSystemSession(cookie)
  if (!session || session.role !== 'admin') return null
  return session
}

// GET — situação do estoque + catálogos de teste rápido e PCR (para o vínculo exame → consumível)
export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request)
  if (!admin) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })

  try {
    const [consumiveis, { data: testes, error }, { data: pcrs, error: ePcr }] = await Promise.all([
      resumoEstoque(),
      supabase.from('testes_rapidos').select('id, nome, consumivel_id').eq('ativo', true).order('ordem'),
      supabase.from('exames_pcr').select('id, nome, codigo, ativo').order('ordem'),
    ])
    if (error || ePcr) throw new Error((error ?? ePcr)!.message)
    return NextResponse.json({ consumiveis, testes: testes ?? [], pcrs: pcrs ?? [] })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erro ao carregar estoque.' }, { status: 500 })
  }
}

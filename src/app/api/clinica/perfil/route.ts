import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabase } from '@/lib/supabase'
import {
  parseClinicaSession,
  hashPassword,
  verifyPassword,
  createClinicaSession,
  CLINICA_COOKIE_NAME,
  CLINICA_COOKIE_OPTIONS,
} from '@/lib/clinica-auth'

async function getClinicaId(): Promise<number | null> {
  const session = (await cookies()).get(CLINICA_COOKIE_NAME)?.value
  if (!session) return null
  const data = await parseClinicaSession(session)
  return data?.clinicaId ?? null
}

export async function GET() {
  const clinicaId = await getClinicaId()
  if (!clinicaId) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })

  const { data, error } = await supabase
    .from('clinicas')
    .select('id, nome, email, telefone, endereco, convite_aceito, criado_em')
    .eq('id', clinicaId)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PATCH(request: NextRequest) {
  const clinicaId = await getClinicaId()
  if (!clinicaId) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })

  const body = await request.json()
  const { nome, email, telefone, endereco, senha_atual, nova_senha } = body

  const updates: Record<string, string> = {}
  if (nome)     updates.nome     = nome.trim()
  if (email)    updates.email    = email.toLowerCase().trim()
  if (telefone) updates.telefone = telefone.trim()
  if (endereco !== undefined) updates.endereco = endereco.trim()

  // Troca de senha
  if (nova_senha) {
    if (!senha_atual) {
      return NextResponse.json({ error: 'Informe a senha atual.' }, { status: 400 })
    }
    if (nova_senha.length < 6) {
      return NextResponse.json({ error: 'Nova senha deve ter pelo menos 6 caracteres.' }, { status: 400 })
    }

    const { data: clinica } = await supabase
      .from('clinicas')
      .select('senha_hash')
      .eq('id', clinicaId)
      .single()

    if (!clinica) return NextResponse.json({ error: 'Clínica não encontrada.' }, { status: 404 })

    const ok = await verifyPassword(senha_atual, clinica.senha_hash)
    if (!ok) return NextResponse.json({ error: 'Senha atual incorreta.' }, { status: 400 })

    updates.senha_hash = await hashPassword(nova_senha)
    updates.convite_aceito = 'true'
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nenhum dado para atualizar.' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('clinicas')
    .update(updates)
    .eq('id', clinicaId)
    .select('id, nome, email, telefone, endereco, convite_aceito, criado_em')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Se trocou a senha, atualiza cookie para remover flag primeira_senha
  const response = NextResponse.json(data)
  if (nova_senha) {
    const newToken = await createClinicaSession(clinicaId, false)
    response.cookies.set(CLINICA_COOKIE_NAME, newToken, CLINICA_COOKIE_OPTIONS)
  }
  return response
}

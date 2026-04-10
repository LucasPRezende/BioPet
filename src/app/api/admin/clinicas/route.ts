import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabase } from '@/lib/supabase'
import { parseSystemSession } from '@/lib/system-auth'
import {
  hashPassword,
  gerarSenhaTemporaria,
  gerarTokenConvite,
} from '@/lib/clinica-auth'
import { sendClinicaInvite } from '@/lib/evolution'

async function requireAdmin() {
  const cookie = (await cookies()).get('sys_session')?.value
  if (!cookie) return null
  const session = await parseSystemSession(cookie)
  if (!session || session.role !== 'admin') return null
  return session
}

export async function GET() {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })

  const { data: clinicas, error } = await supabase
    .from('clinicas')
    .select('id, nome, email, telefone, endereco, convite_aceito, ativo, criado_em')
    .order('nome')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Conta veterinários por clínica
  const ids = (clinicas ?? []).map(c => c.id)
  let vetCounts: Record<number, number> = {}

  if (ids.length > 0) {
    const { data: vets } = await supabase
      .from('veterinarios')
      .select('clinica_id')
      .in('clinica_id', ids)

    for (const v of vets ?? []) {
      if (v.clinica_id) {
        vetCounts[v.clinica_id] = (vetCounts[v.clinica_id] ?? 0) + 1
      }
    }
  }

  const result = (clinicas ?? []).map(c => ({
    ...c,
    total_vets: vetCounts[c.id] ?? 0,
  }))

  return NextResponse.json(result)
}

export async function POST(request: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })

  const { nome, email, telefone, endereco, vet_ids } = await request.json()

  if (!nome?.trim() || !email?.trim()) {
    return NextResponse.json({ error: 'Nome e e-mail são obrigatórios.' }, { status: 400 })
  }

  const senhaTemporaria = gerarSenhaTemporaria()
  const tokenConvite    = gerarTokenConvite()
  const senhaHash       = await hashPassword(senhaTemporaria)

  const { data: clinica, error } = await supabase
    .from('clinicas')
    .insert({
      nome:           nome.trim(),
      email:          email.toLowerCase().trim(),
      telefone:       telefone?.trim() ?? null,
      endereco:       endereco?.trim() ?? null,
      senha_hash:     senhaHash,
      token_convite:  tokenConvite,
      convite_aceito: false,
      ativo:          true,
    })
    .select('id, nome, email, telefone')
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'E-mail já cadastrado.' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Vincula veterinários
  if (Array.isArray(vet_ids) && vet_ids.length > 0) {
    await supabase
      .from('veterinarios')
      .update({ clinica_id: clinica.id })
      .in('id', vet_ids)
  }

  // Envia convite via WhatsApp (se tiver telefone)
  if (telefone) {
    await sendClinicaInvite(telefone, nome.trim(), tokenConvite, senhaTemporaria)
  }

  return NextResponse.json({ success: true, clinica }, { status: 201 })
}

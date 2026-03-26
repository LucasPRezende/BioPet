import { NextRequest, NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { supabase } from '@/lib/supabase'

const BUCKET = 'laudos'

export async function GET() {
  const { data, error } = await supabase
    .from('laudos')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(request: NextRequest) {
  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Falha ao processar o formulário.' }, { status: 400 })
  }

  const nomePet = (formData.get('nome_pet') as string)?.trim()
  const especie = (formData.get('especie') as string)?.trim()
  const tutor = (formData.get('tutor') as string)?.trim()
  const telefone = (formData.get('telefone') as string)?.trim()
  const file = formData.get('pdf') as File | null

  if (!nomePet || !especie || !tutor || !telefone || !file) {
    return NextResponse.json({ error: 'Todos os campos são obrigatórios.' }, { status: 400 })
  }

  if (file.type !== 'application/pdf') {
    return NextResponse.json({ error: 'O arquivo deve ser um PDF.' }, { status: 400 })
  }

  const token = uuidv4()
  const filename = `${token}.pdf`
  const buffer = Buffer.from(await file.arrayBuffer())

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(filename, buffer, { contentType: 'application/pdf' })

  if (uploadError) {
    return NextResponse.json({ error: `Erro ao salvar arquivo: ${uploadError.message}` }, { status: 500 })
  }

  const { data, error } = await supabase
    .from('laudos')
    .insert({
      nome_pet: nomePet,
      especie,
      tutor,
      telefone,
      token,
      filename,
      original_name: file.name,
      tipo: 'upload',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

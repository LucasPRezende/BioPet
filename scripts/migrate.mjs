#!/usr/bin/env node
// Roda migrations SQL no Supabase via Management API
// Uso: node scripts/migrate.mjs supabase/migration_v4.sql

import { readFileSync } from 'fs'
import { argv } from 'process'

const PAT = process.env.SUPABASE_PAT
const REF = 'teozyceggokmsrmuitnj'

if (!PAT) {
  console.error('Erro: defina SUPABASE_PAT no .env.local')
  process.exit(1)
}

const file = argv[2]
if (!file) {
  console.error('Uso: node scripts/migrate.mjs <arquivo.sql>')
  process.exit(1)
}

const sql = readFileSync(file, 'utf8')

// Divide por ; ignorando blocos vazios e comentários
const statements = sql
  .split(';')
  .map(s => s.replace(/--[^\n]*/g, '').trim())
  .filter(s => s.length > 0)

console.log(`Rodando ${statements.length} statement(s) de ${file}...\n`)

for (const stmt of statements) {
  const preview = stmt.replace(/\s+/g, ' ').slice(0, 60)
  process.stdout.write(`→ ${preview}... `)

  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${PAT}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: stmt }),
  })

  const data = await res.json()

  if (!res.ok || (Array.isArray(data) === false && data.error)) {
    console.log(`ERRO\n  ${JSON.stringify(data)}`)
  } else {
    console.log('OK')
  }
}

console.log('\nMigration concluída!')

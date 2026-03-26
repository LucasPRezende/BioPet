import 'server-only'
import { DatabaseSync } from 'node:sqlite'
import path from 'path'
import fs from 'fs'

const DATA_DIR = path.join(process.cwd(), 'data')
const DB_PATH  = path.join(DATA_DIR, 'veterinaria.db')

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true })
}

declare global {
  // eslint-disable-next-line no-var
  var _db: DatabaseSync | undefined
}

/** Verifica se uma coluna existe na tabela usando PRAGMA table_info */
function hasColumn(db: DatabaseSync, table: string, column: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  return rows.some(r => r.name === column)
}

function getDb(): DatabaseSync {
  if (!global._db) {
    global._db = new DatabaseSync(DB_PATH)

    // Schema base — colunas originais
    global._db.exec(`
      CREATE TABLE IF NOT EXISTS laudos (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        nome_pet      TEXT NOT NULL,
        especie       TEXT NOT NULL,
        tutor         TEXT NOT NULL,
        telefone      TEXT NOT NULL,
        token         TEXT UNIQUE NOT NULL,
        filename      TEXT NOT NULL,
        original_name TEXT NOT NULL,
        created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // Migração segura: adiciona cada coluna nova somente se não existir
    const db = global._db
    const newCols: Array<[string, string]> = [
      ['tipo',               "TEXT DEFAULT 'upload'"],
      ['sexo',               'TEXT'],
      ['raca',               'TEXT'],
      ['medico_responsavel', 'TEXT'],
      ['idade',              'TEXT'],
      ['data_laudo',         'TEXT'],
      ['texto',              'TEXT'],
    ]
    for (const [col, def] of newCols) {
      if (!hasColumn(db, 'laudos', col)) {
        db.exec(`ALTER TABLE laudos ADD COLUMN ${col} ${def}`)
      }
    }
  }
  return global._db
}

export default getDb()

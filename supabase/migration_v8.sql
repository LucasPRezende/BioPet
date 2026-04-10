-- BioPet — Migration v8: Clínicas parceiras

-- ─── Tabela clinicas ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clinicas (
  id              SERIAL PRIMARY KEY,
  nome            TEXT NOT NULL,
  email           TEXT UNIQUE NOT NULL,
  telefone        TEXT,
  endereco        TEXT,
  senha_hash      TEXT NOT NULL,
  token_convite   TEXT,
  convite_aceito  BOOLEAN DEFAULT FALSE,
  ativo           BOOLEAN DEFAULT TRUE,
  criado_em       TIMESTAMP DEFAULT NOW()
);

-- ─── Vincula veterinários à clínica ──────────────────────────────────────────
ALTER TABLE veterinarios
  ADD COLUMN IF NOT EXISTS clinica_id INTEGER REFERENCES clinicas(id);

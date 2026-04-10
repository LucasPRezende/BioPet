-- ============================================================
-- BioPet — Migration: Sistema de Autenticação + Comissões
-- Execute no SQL Editor do Supabase
-- ============================================================

-- 1. Tabela de usuários do sistema
CREATE TABLE IF NOT EXISTS system_users (
  id            SERIAL PRIMARY KEY,
  nome          TEXT NOT NULL,
  email         TEXT UNIQUE NOT NULL,
  senha_hash    TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'user', -- 'admin' ou 'user'
  ativo         BOOLEAN DEFAULT TRUE,
  primeira_senha BOOLEAN DEFAULT TRUE,
  criado_em     TIMESTAMP DEFAULT NOW()
);

-- 2. Tabela de comissões por tipo de exame
CREATE TABLE IF NOT EXISTS comissoes_exame (
  id              SERIAL PRIMARY KEY,
  tipo_exame      TEXT NOT NULL UNIQUE,
  valor_comissao  NUMERIC(10,2) NOT NULL DEFAULT 0
);

-- 3. Adicionar colunas à tabela laudos
ALTER TABLE laudos ADD COLUMN IF NOT EXISTS system_user_id INTEGER REFERENCES system_users(id);
ALTER TABLE laudos ADD COLUMN IF NOT EXISTS tipo_exame TEXT;

-- 4. Inserir tipos de exame padrão
INSERT INTO comissoes_exame (tipo_exame, valor_comissao) VALUES
  ('Raio-X',              0),
  ('Ultrassom Abdominal', 0),
  ('Ultrassom Cervical',  0),
  ('Hemogasometria',      0),
  ('Elastografia',        0),
  ('Endoscopia',          0),
  ('Cistocentese',        0),
  ('Outros',              0)
ON CONFLICT (tipo_exame) DO NOTHING;

-- ============================================================
-- IMPORTANTE: Após rodar esta migration, acesse
--   /api/setup
-- para criar os usuários administradores iniciais.
-- ============================================================

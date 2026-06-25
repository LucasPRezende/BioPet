-- =====================================================================
-- MIGRATION CONSOLIDADA — Agente WhatsApp (DEV -> PRD)
-- =====================================================================
-- Aplicar UMA VEZ no Supabase de PRODUÇÃO (ykhshkgdikjplnedtxye) antes de
-- subir o agente para o prod. Tudo idempotente (IF NOT EXISTS) — seguro
-- rodar mesmo que algo já exista. Já aplicado no DEV (teozyceggokmsrmuitnj).
--
-- Reúne: migration_conversas.sql, migration_agente_mensagens.sql,
-- migration_agente_faq.sql, migration_agente_exames_nao_agendaveis.sql
-- =====================================================================

-- 1) Estado da conversa da IA (histórico no formato Messages API, por telefone)
CREATE TABLE IF NOT EXISTS conversas (
  id             BIGSERIAL PRIMARY KEY,
  telefone       TEXT NOT NULL UNIQUE,
  historico      JSONB NOT NULL DEFAULT '[]'::jsonb,
  ultima_msg_id  TEXT,
  atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expira_em      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS conversas_telefone_idx ON conversas (telefone);

-- 2) Registro das mensagens SAÍDAS (fromMe): distingue IA / sistema / humano
--    (contexto do sistema na thread + recuo quando humano responde)
CREATE TABLE IF NOT EXISTS agente_mensagens_enviadas (
  id         BIGSERIAL PRIMARY KEY,
  telefone   TEXT NOT NULL,
  msg_id     TEXT,
  origem     TEXT NOT NULL,                 -- 'ia' | 'sistema' | 'humano'
  texto      TEXT,
  consumido  BOOLEAN NOT NULL DEFAULT false,
  criado_em  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ame_msgid_idx ON agente_mensagens_enviadas (msg_id);
CREATE INDEX IF NOT EXISTS ame_tel_idx   ON agente_mensagens_enviadas (telefone, criado_em);

-- 3) FAQ/orientações editáveis da IA (painel /admin/configuracoes/agente)
ALTER TABLE configuracoes_agente ADD COLUMN IF NOT EXISTS faq TEXT;

-- 4) Exames que a BioPet faz mas a IA NÃO pode agendar (ex.: bioquímica)
ALTER TABLE configuracoes_agente
  ADD COLUMN IF NOT EXISTS exames_nao_agendaveis JSONB NOT NULL DEFAULT '[]'::jsonb;

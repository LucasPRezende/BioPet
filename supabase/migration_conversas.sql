-- Migration: tabela `conversas` — estado do agente de WhatsApp (IA).
-- Uma linha por telefone. `historico` guarda as mensagens no formato da
-- Anthropic Messages API (array de {role, content}); reconstruímos o contexto
-- da conversa a cada mensagem recebida. `expira_em` reinicia a conversa após
-- inatividade. Aplicar em DEV (teozyceggokmsrmuitnj) primeiro.

CREATE TABLE IF NOT EXISTS conversas (
  id             BIGSERIAL PRIMARY KEY,
  telefone       TEXT NOT NULL UNIQUE,         -- normalizado, com DDI 55
  historico      JSONB NOT NULL DEFAULT '[]'::jsonb,
  ultima_msg_id  TEXT,                         -- dedupe de mensagem (Evolution reenvia)
  atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expira_em      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS conversas_telefone_idx ON conversas (telefone);

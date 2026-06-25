-- Migration: agente_mensagens_enviadas — registro das mensagens SAÍDAS (fromMe).
--
-- O webhook MESSAGES_UPSERT da Evolution entrega também as mensagens enviadas
-- (fromMe). Misturam-se 3 fontes: a própria IA, o SISTEMA (link de pagamento,
-- confirmação) e um HUMANO digitando pelo WhatsApp. Para distinguir, gravamos
-- aqui o id de cada mensagem que NÓS enviamos (origem 'ia' | 'sistema'); um
-- fromMe cujo id NÃO está aqui = humano respondeu (a IA recua).
--
-- 'texto' guarda o conteúdo das mensagens do SISTEMA (e do HUMANO) para virar
-- contexto da IA. 'consumido' marca o que já foi injetado como contexto.
-- Aplicar em DEV (teozyceggokmsrmuitnj) e depois PRD.

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

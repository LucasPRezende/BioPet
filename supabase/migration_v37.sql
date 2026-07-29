-- Migration v37: notificações push no navegador (Web Push)
--
-- Guarda a subscription do navegador (endpoint + chaves) de cada usuário do
-- sistema que ativou notificações. Usado para avisar no PC/Android quando o
-- bot trava ou precisa de atenção, além do WhatsApp que já existe hoje.
-- Um usuário pode ter mais de um dispositivo/navegador (PC + celular).

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES system_users(id) ON DELETE CASCADE,
  endpoint    TEXT NOT NULL UNIQUE,
  p256dh      TEXT NOT NULL,
  auth        TEXT NOT NULL,
  user_agent  TEXT,
  criado_em   TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON push_subscriptions(user_id);

-- Lembrete automático quando o cliente ignora uma pergunta da IA.
--
-- `lembrete_enviado_em` marca quando a IA reenviou a última pergunta por
-- inatividade do cliente. NULL = nenhum lembrete pendente pra essa conversa.
-- Rodar em DEV e PRD (idempotente).

ALTER TABLE conversas
  ADD COLUMN IF NOT EXISTS lembrete_enviado_em TIMESTAMPTZ;

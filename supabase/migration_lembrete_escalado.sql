-- Fix do bug de re-escalação em loop do lembrete automático (achado 25/09/2026):
-- depois de escalar pra atendente, `atendimento_humano_ate` expira em algumas
-- horas (tempo_retorno_ia_horas) e a rota de lembrete voltava a escalar a
-- MESMA pendência de novo, repetindo a cada ciclo. `lembrete_escalado` marca
-- em definitivo "já escalei essa pendência, não escalar de novo" até a
-- conversa avançar de verdade (salvarConversa reseta pra false).
-- Rodar em DEV e PRD (idempotente).

ALTER TABLE conversas
  ADD COLUMN IF NOT EXISTS lembrete_escalado BOOLEAN NOT NULL DEFAULT false;

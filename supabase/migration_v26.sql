-- Migration v26: tabela tutores_bloqueados
--
-- Registra tutores com atendimento humano ativo (agente pausado até atendimento_humano_ate).
-- Criada originalmente direto no PRD — esta migration sincroniza o DEV.

CREATE TABLE IF NOT EXISTS tutores_bloqueados (
  id                     SERIAL PRIMARY KEY,
  tutor_id               INTEGER REFERENCES tutores(id),
  atendimento_humano_ate TIMESTAMP,
  criado_em              TIMESTAMP DEFAULT NOW()
);

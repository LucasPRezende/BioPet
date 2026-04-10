-- BioPet — Migration v7: Notificações, configurações do agente e atendimento humano

-- ─── Tabela notificacoes ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notificacoes (
  id               SERIAL PRIMARY KEY,
  telefone         TEXT NOT NULL,
  nome_tutor       TEXT,
  motivo           TEXT NOT NULL,
  mensagem_cliente TEXT,
  mensagem_ia      TEXT,
  visualizado      BOOLEAN DEFAULT FALSE,
  criado_em        TIMESTAMP DEFAULT NOW()
);

-- ─── Tabela configuracoes_agente ────────────────────────────────────────────
-- numeros_bloqueados armazena [{numero, descricao}] como JSONB
CREATE TABLE IF NOT EXISTS configuracoes_agente (
  id                      SERIAL PRIMARY KEY,
  tempo_retorno_ia_horas  INTEGER DEFAULT 2,
  numeros_bloqueados      JSONB DEFAULT '[]',
  atualizado_em           TIMESTAMP DEFAULT NOW()
);

INSERT INTO configuracoes_agente (tempo_retorno_ia_horas, numeros_bloqueados)
VALUES (2, '[]')
ON CONFLICT DO NOTHING;

-- ─── Tutores: colunas de atendimento humano ─────────────────────────────────
ALTER TABLE tutores
  ADD COLUMN IF NOT EXISTS atendimento_humano     BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS atendimento_humano_ate TIMESTAMP;

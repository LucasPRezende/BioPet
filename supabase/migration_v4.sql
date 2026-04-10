-- BioPet — Migration v4: Tutores, Pets, Agendamentos + integração N8N

CREATE TABLE IF NOT EXISTS tutores (
  id           SERIAL PRIMARY KEY,
  telefone     TEXT UNIQUE NOT NULL,
  nome         TEXT,
  criado_em    TIMESTAMP DEFAULT NOW(),
  atualizado_em TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pets (
  id           SERIAL PRIMARY KEY,
  tutor_id     INTEGER REFERENCES tutores(id) ON DELETE CASCADE,
  nome         TEXT NOT NULL,
  especie      TEXT,
  raca         TEXT,
  criado_em    TIMESTAMP DEFAULT NOW(),
  atualizado_em TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agendamentos (
  id                  SERIAL PRIMARY KEY,
  tutor_id            INTEGER REFERENCES tutores(id),
  pet_id              INTEGER REFERENCES pets(id),
  system_user_id      INTEGER REFERENCES system_users(id),
  tipo_exame          TEXT NOT NULL,
  data_hora           TIMESTAMP NOT NULL,
  duracao_minutos     INTEGER,
  valor               NUMERIC(10,2),
  forma_pagamento     TEXT DEFAULT 'a confirmar',
  google_calendar_id  TEXT,
  status              TEXT DEFAULT 'agendado',
  observacoes         TEXT,
  criado_em           TIMESTAMP DEFAULT NOW()
);

-- Vínculos do laudo com agendamento, tutor e pet
ALTER TABLE laudos ADD COLUMN IF NOT EXISTS agendamento_id INTEGER REFERENCES agendamentos(id);
ALTER TABLE laudos ADD COLUMN IF NOT EXISTS tutor_id       INTEGER REFERENCES tutores(id);
ALTER TABLE laudos ADD COLUMN IF NOT EXISTS pet_id         INTEGER REFERENCES pets(id);

-- Índices úteis
CREATE INDEX IF NOT EXISTS idx_agendamentos_data_hora  ON agendamentos(data_hora);
CREATE INDEX IF NOT EXISTS idx_agendamentos_tutor_id   ON agendamentos(tutor_id);
CREATE INDEX IF NOT EXISTS idx_pets_tutor_id           ON pets(tutor_id);
CREATE INDEX IF NOT EXISTS idx_tutores_telefone        ON tutores(telefone);

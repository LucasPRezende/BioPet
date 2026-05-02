-- migration_v16: módulo de revisões de exames

-- Marca agendamentos que são revisões
ALTER TABLE agendamentos
  ADD COLUMN IF NOT EXISTS is_revisao                boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS agendamento_original_id   integer REFERENCES agendamentos(id),
  ADD COLUMN IF NOT EXISTS laudo_revisao_solicitado  boolean DEFAULT false;

-- Configuração por tipo de exame
CREATE TABLE IF NOT EXISTS revisao_config (
  id                        serial PRIMARY KEY,
  tipo_exame                text          NOT NULL UNIQUE,
  permite_revisao           boolean       NOT NULL DEFAULT true,
  prazo_dias                integer       NOT NULL DEFAULT 30,
  max_revisoes              integer       NOT NULL DEFAULT 1,
  valor_horario_comercial   numeric(10,2) NOT NULL DEFAULT 0,
  valor_fora_comercial      numeric(10,2) NOT NULL DEFAULT 0,
  gera_laudo                boolean       NOT NULL DEFAULT false,
  valor_laudo_extra         numeric(10,2) NOT NULL DEFAULT 90,
  horario_inicio            time          NOT NULL DEFAULT '08:00',
  horario_fim               time          NOT NULL DEFAULT '18:00',
  created_at                timestamptz   NOT NULL DEFAULT now()
);

-- Config inicial: tipos de ultrassom disponíveis no sistema
INSERT INTO revisao_config (tipo_exame, permite_revisao, prazo_dias, valor_horario_comercial, valor_fora_comercial, gera_laudo, valor_laudo_extra, horario_inicio, horario_fim)
VALUES
  ('Ultrassom Abdominal Total', true, 30, 0, 0, false, 90, '08:00', '18:00'),
  ('Ultrassom Cervical',        true, 30, 0, 0, false, 90, '08:00', '18:00')
ON CONFLICT (tipo_exame) DO NOTHING;

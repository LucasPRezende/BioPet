-- Migration v47: Hemograma (analisador hematológico)
--
-- Valores de referência do hemograma por espécie/faixa etária, editáveis em
-- /admin/hemograma/referencias. O CSV da máquina não traz referência, então o
-- laudo usa esta tabela.
--
-- `parametro` é o código de src/lib/hemograma.ts (HEM, HGB, HCT, VCM, HCM,
-- CHCM, RDW, LEU, NEU_REL, NEU_ABS, ..., PLQ, VPM). Relativos em %, absolutos
-- em 10³/µL, hemácias em 10⁶/µL, plaquetas em 10³/µL.
--
-- Seed: valores de literatura (cão e gato adultos, faixa 'todos') como ponto
-- de partida — REVISAR com a responsável técnica antes de emitir laudos.
--
-- O exame "Hemograma" NÃO é cadastrado aqui: cadastrar em Preços
-- (/admin/comissoes) já com o preço, senão o agente de WhatsApp enxergaria um
-- exame de R$ 0. O laudo usa tipo_exame = 'Hemograma'.
--
-- Roda uma vez. Idempotente.

CREATE TABLE IF NOT EXISTS hemograma_referencia (
  id            SERIAL PRIMARY KEY,
  parametro     TEXT NOT NULL,
  especie       TEXT NOT NULL,
  faixa_etaria  TEXT NOT NULL DEFAULT 'todos',
  valor_min     NUMERIC(10,4),
  valor_max     NUMERIC(10,4),
  criado_em     TIMESTAMP DEFAULT NOW(),
  UNIQUE (parametro, especie, faixa_etaria)
);

ALTER TABLE hemograma_referencia ENABLE ROW LEVEL SECURITY;

INSERT INTO hemograma_referencia (parametro, especie, faixa_etaria, valor_min, valor_max) VALUES
  -- Cão
  ('HEM',      'cao', 'todos',   5.5,   8.5),
  ('HGB',      'cao', 'todos',  12.0,  18.0),
  ('HCT',      'cao', 'todos',  37.0,  55.0),
  ('VCM',      'cao', 'todos',  60.0,  77.0),
  ('HCM',      'cao', 'todos',  19.5,  24.5),
  ('CHCM',     'cao', 'todos',  32.0,  36.0),
  ('RDW',      'cao', 'todos',  12.0,  16.0),
  ('LEU',      'cao', 'todos',   6.0,  17.0),
  ('NEU_REL',  'cao', 'todos',  60.0,  77.0),
  ('NEU_ABS',  'cao', 'todos',   3.0,  11.5),
  ('LIN_REL',  'cao', 'todos',  12.0,  30.0),
  ('LIN_ABS',  'cao', 'todos',   1.0,   4.8),
  ('MON_REL',  'cao', 'todos',   3.0,  10.0),
  ('MON_ABS',  'cao', 'todos',  0.15,  1.35),
  ('EOS_REL',  'cao', 'todos',   2.0,  10.0),
  ('EOS_ABS',  'cao', 'todos',   0.1,  1.25),
  ('BASO_REL', 'cao', 'todos',   0.0,   1.0),
  ('BASO_ABS', 'cao', 'todos',   0.0,   0.1),
  ('PLQ',      'cao', 'todos', 200.0, 500.0),
  -- Gato
  ('HEM',      'gato', 'todos',  5.0,  10.0),
  ('HGB',      'gato', 'todos',  8.0,  15.0),
  ('HCT',      'gato', 'todos', 24.0,  45.0),
  ('VCM',      'gato', 'todos', 39.0,  55.0),
  ('HCM',      'gato', 'todos', 12.5,  17.5),
  ('CHCM',     'gato', 'todos', 30.0,  36.0),
  ('LEU',      'gato', 'todos',  5.5,  19.5),
  ('NEU_REL',  'gato', 'todos', 35.0,  75.0),
  ('NEU_ABS',  'gato', 'todos',  2.5,  12.5),
  ('LIN_REL',  'gato', 'todos', 20.0,  55.0),
  ('LIN_ABS',  'gato', 'todos',  1.5,   7.0),
  ('MON_REL',  'gato', 'todos',  1.0,   4.0),
  ('MON_ABS',  'gato', 'todos',  0.0,  0.85),
  ('EOS_REL',  'gato', 'todos',  2.0,  12.0),
  ('EOS_ABS',  'gato', 'todos',  0.0,   1.5),
  ('BASO_REL', 'gato', 'todos',  0.0,   1.0),
  ('BASO_ABS', 'gato', 'todos',  0.0,   0.1),
  ('PLQ',      'gato', 'todos', 300.0, 800.0)
ON CONFLICT (parametro, especie, faixa_etaria) DO NOTHING;

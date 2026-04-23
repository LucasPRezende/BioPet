-- Migration v13: tabela de referência bioquímica, falecimento de pets

-- Tabela de referência por exame, espécie e faixa etária
CREATE TABLE IF NOT EXISTS bioquimica_referencia (
  id                  SERIAL PRIMARY KEY,
  bioquimica_exame_id INTEGER REFERENCES bioquimica_exames(id) ON DELETE CASCADE,
  especie             TEXT NOT NULL,
  faixa_etaria        TEXT NOT NULL,
  valor_min           NUMERIC(10,4),
  valor_max           NUMERIC(10,4),
  unidade             TEXT,
  observacao          TEXT,
  criado_em           TIMESTAMP DEFAULT NOW(),
  UNIQUE(bioquimica_exame_id, especie, faixa_etaria)
);

-- Falecimento do pet
ALTER TABLE pets
  ADD COLUMN IF NOT EXISTS falecido              BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS falecido_em           DATE,
  ADD COLUMN IF NOT EXISTS falecido_registrado_por TEXT;

-- Seed: valores de referência veterinária (cão e gato)

-- TGP/ALT
INSERT INTO bioquimica_referencia (bioquimica_exame_id, especie, faixa_etaria, valor_min, valor_max, unidade)
SELECT id, 'cao', 'todos', 10, 100, 'U/L' FROM bioquimica_exames WHERE codigo = 'TGP'
ON CONFLICT DO NOTHING;

INSERT INTO bioquimica_referencia (bioquimica_exame_id, especie, faixa_etaria, valor_min, valor_max, unidade)
SELECT id, 'gato', 'todos', 10, 80, 'U/L' FROM bioquimica_exames WHERE codigo = 'TGP'
ON CONFLICT DO NOTHING;

-- TGO/AST
INSERT INTO bioquimica_referencia (bioquimica_exame_id, especie, faixa_etaria, valor_min, valor_max, unidade)
SELECT id, 'cao', 'todos', 10, 50, 'U/L' FROM bioquimica_exames WHERE codigo = 'TGO'
ON CONFLICT DO NOTHING;

INSERT INTO bioquimica_referencia (bioquimica_exame_id, especie, faixa_etaria, valor_min, valor_max, unidade)
SELECT id, 'gato', 'todos', 10, 50, 'U/L' FROM bioquimica_exames WHERE codigo = 'TGO'
ON CONFLICT DO NOTHING;

-- Creatinina
INSERT INTO bioquimica_referencia (bioquimica_exame_id, especie, faixa_etaria, valor_min, valor_max, unidade)
SELECT id, 'cao', 'filhote', 0.3, 0.9, 'mg/dL' FROM bioquimica_exames WHERE codigo = 'CREA'
ON CONFLICT DO NOTHING;

INSERT INTO bioquimica_referencia (bioquimica_exame_id, especie, faixa_etaria, valor_min, valor_max, unidade)
SELECT id, 'cao', 'adulto', 0.5, 1.5, 'mg/dL' FROM bioquimica_exames WHERE codigo = 'CREA'
ON CONFLICT DO NOTHING;

INSERT INTO bioquimica_referencia (bioquimica_exame_id, especie, faixa_etaria, valor_min, valor_max, unidade)
SELECT id, 'cao', 'idoso', 0.5, 1.8, 'mg/dL' FROM bioquimica_exames WHERE codigo = 'CREA'
ON CONFLICT DO NOTHING;

INSERT INTO bioquimica_referencia (bioquimica_exame_id, especie, faixa_etaria, valor_min, valor_max, unidade)
SELECT id, 'gato', 'filhote', 0.3, 0.8, 'mg/dL' FROM bioquimica_exames WHERE codigo = 'CREA'
ON CONFLICT DO NOTHING;

INSERT INTO bioquimica_referencia (bioquimica_exame_id, especie, faixa_etaria, valor_min, valor_max, unidade)
SELECT id, 'gato', 'adulto', 0.8, 1.8, 'mg/dL' FROM bioquimica_exames WHERE codigo = 'CREA'
ON CONFLICT DO NOTHING;

INSERT INTO bioquimica_referencia (bioquimica_exame_id, especie, faixa_etaria, valor_min, valor_max, unidade)
SELECT id, 'gato', 'idoso', 0.8, 2.0, 'mg/dL' FROM bioquimica_exames WHERE codigo = 'CREA'
ON CONFLICT DO NOTHING;

-- Glicose
INSERT INTO bioquimica_referencia (bioquimica_exame_id, especie, faixa_etaria, valor_min, valor_max, unidade)
SELECT id, 'cao', 'todos', 70, 120, 'mg/dL' FROM bioquimica_exames WHERE codigo = 'GLIC'
ON CONFLICT DO NOTHING;

INSERT INTO bioquimica_referencia (bioquimica_exame_id, especie, faixa_etaria, valor_min, valor_max, unidade)
SELECT id, 'gato', 'todos', 70, 150, 'mg/dL' FROM bioquimica_exames WHERE codigo = 'GLIC'
ON CONFLICT DO NOTHING;

-- Ureia
INSERT INTO bioquimica_referencia (bioquimica_exame_id, especie, faixa_etaria, valor_min, valor_max, unidade)
SELECT id, 'cao', 'todos', 15, 45, 'mg/dL' FROM bioquimica_exames WHERE codigo = 'UREIA'
ON CONFLICT DO NOTHING;

INSERT INTO bioquimica_referencia (bioquimica_exame_id, especie, faixa_etaria, valor_min, valor_max, unidade)
SELECT id, 'gato', 'todos', 15, 60, 'mg/dL' FROM bioquimica_exames WHERE codigo = 'UREIA'
ON CONFLICT DO NOTHING;

-- Colesterol
INSERT INTO bioquimica_referencia (bioquimica_exame_id, especie, faixa_etaria, valor_min, valor_max, unidade)
SELECT id, 'cao', 'todos', 110, 320, 'mg/dL' FROM bioquimica_exames WHERE codigo = 'COL'
ON CONFLICT DO NOTHING;

INSERT INTO bioquimica_referencia (bioquimica_exame_id, especie, faixa_etaria, valor_min, valor_max, unidade)
SELECT id, 'gato', 'todos', 75, 220, 'mg/dL' FROM bioquimica_exames WHERE codigo = 'COL'
ON CONFLICT DO NOTHING;

-- Triglicerídeos
INSERT INTO bioquimica_referencia (bioquimica_exame_id, especie, faixa_etaria, valor_min, valor_max, unidade)
SELECT id, 'cao', 'todos', 20, 150, 'mg/dL' FROM bioquimica_exames WHERE codigo = 'TRIG'
ON CONFLICT DO NOTHING;

INSERT INTO bioquimica_referencia (bioquimica_exame_id, especie, faixa_etaria, valor_min, valor_max, unidade)
SELECT id, 'gato', 'todos', 25, 160, 'mg/dL' FROM bioquimica_exames WHERE codigo = 'TRIG'
ON CONFLICT DO NOTHING;

-- Fosfatase Alcalina
INSERT INTO bioquimica_referencia (bioquimica_exame_id, especie, faixa_etaria, valor_min, valor_max, unidade)
SELECT id, 'cao', 'filhote', 20, 350, 'U/L' FROM bioquimica_exames WHERE codigo = 'FAL'
ON CONFLICT DO NOTHING;

INSERT INTO bioquimica_referencia (bioquimica_exame_id, especie, faixa_etaria, valor_min, valor_max, unidade)
SELECT id, 'cao', 'adulto', 20, 150, 'U/L' FROM bioquimica_exames WHERE codigo = 'FAL'
ON CONFLICT DO NOTHING;

INSERT INTO bioquimica_referencia (bioquimica_exame_id, especie, faixa_etaria, valor_min, valor_max, unidade)
SELECT id, 'gato', 'todos', 10, 90, 'U/L' FROM bioquimica_exames WHERE codigo = 'FAL'
ON CONFLICT DO NOTHING;

-- Alfa Amilase
INSERT INTO bioquimica_referencia (bioquimica_exame_id, especie, faixa_etaria, valor_min, valor_max, unidade)
SELECT id, 'cao', 'todos', 200, 1200, 'U/L' FROM bioquimica_exames WHERE codigo = 'AMIL'
ON CONFLICT DO NOTHING;

INSERT INTO bioquimica_referencia (bioquimica_exame_id, especie, faixa_etaria, valor_min, valor_max, unidade)
SELECT id, 'gato', 'todos', 200, 800, 'U/L' FROM bioquimica_exames WHERE codigo = 'AMIL'
ON CONFLICT DO NOTHING;

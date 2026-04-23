-- Migration v14: adiciona método à tabela de referência bioquímica e popula com valores oficiais BS-200 Mindray/Invitro

-- 1. Adiciona coluna metodo (vazia por padrão para não quebrar registros existentes)
ALTER TABLE bioquimica_referencia
  ADD COLUMN IF NOT EXISTS metodo TEXT NOT NULL DEFAULT '';

-- 2. Remove constraint antiga (apenas exame+espécie+faixa) e adiciona nova incluindo metodo
ALTER TABLE bioquimica_referencia
  DROP CONSTRAINT IF EXISTS bioquimica_referencia_bioquimica_exame_id_especie_faixa_etaria_key;

ALTER TABLE bioquimica_referencia
  ADD CONSTRAINT bioquimica_referencia_exame_especie_faixa_metodo_key
  UNIQUE (bioquimica_exame_id, especie, faixa_etaria, metodo);

-- 3. Adiciona UNIQUE em codigo (idempotente) e insere exames faltantes
ALTER TABLE bioquimica_exames
  ADD CONSTRAINT IF NOT EXISTS bioquimica_exames_codigo_key UNIQUE (codigo);

INSERT INTO bioquimica_exames (nome, codigo, preco_pix, preco_cartao, ordem) VALUES
  ('Albumina',          'ALB',  0, 0, 10),
  ('Bilirrubina Total', 'BILI', 0, 0, 11)
ON CONFLICT (codigo) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════
-- Valores de referência oficiais — Tabela BS-200 Mindray / Invitro
-- ══════════════════════════════════════════════════════════════════

-- ── ESPÉCIE CANINA ──────────────────────────────────────────────
INSERT INTO bioquimica_referencia (bioquimica_exame_id, especie, faixa_etaria, metodo, valor_min, valor_max, unidade)
SELECT id, 'cao', 'todos', 'Cinético', 1519, 2665, 'U/L' FROM bioquimica_exames WHERE codigo = 'AMIL'
ON CONFLICT ON CONSTRAINT bioquimica_referencia_exame_especie_faixa_metodo_key DO NOTHING;

INSERT INTO bioquimica_referencia (bioquimica_exame_id, especie, faixa_etaria, metodo, valor_min, valor_max, unidade)
SELECT id, 'cao', 'todos', 'Colorimétrico (BCG)', 2.3, 3.8, 'g/dL' FROM bioquimica_exames WHERE codigo = 'ALB'
ON CONFLICT ON CONSTRAINT bioquimica_referencia_exame_especie_faixa_metodo_key DO NOTHING;

INSERT INTO bioquimica_referencia (bioquimica_exame_id, especie, faixa_etaria, metodo, valor_min, valor_max, unidade)
SELECT id, 'cao', 'todos', 'Colorimétrico', 0.1, 0.5, 'mg/dL' FROM bioquimica_exames WHERE codigo = 'BILI'
ON CONFLICT ON CONSTRAINT bioquimica_referencia_exame_especie_faixa_metodo_key DO NOTHING;

INSERT INTO bioquimica_referencia (bioquimica_exame_id, especie, faixa_etaria, metodo, valor_min, valor_max, unidade)
SELECT id, 'cao', 'todos', 'Enzimático-colorimétrico', 169, 285, 'mg/dL' FROM bioquimica_exames WHERE codigo = 'COL'
ON CONFLICT ON CONSTRAINT bioquimica_referencia_exame_especie_faixa_metodo_key DO NOTHING;

INSERT INTO bioquimica_referencia (bioquimica_exame_id, especie, faixa_etaria, metodo, valor_min, valor_max, unidade)
SELECT id, 'cao', 'todos', 'Cinético-colorimétrico', 0.5, 1.5, 'mg/dL' FROM bioquimica_exames WHERE codigo = 'CREA'
ON CONFLICT ON CONSTRAINT bioquimica_referencia_exame_especie_faixa_metodo_key DO NOTHING;

INSERT INTO bioquimica_referencia (bioquimica_exame_id, especie, faixa_etaria, metodo, valor_min, valor_max, unidade)
SELECT id, 'cao', 'todos', 'Cinético otimizado', 49, 137.7, 'U/L' FROM bioquimica_exames WHERE codigo = 'FAL'
ON CONFLICT ON CONSTRAINT bioquimica_referencia_exame_especie_faixa_metodo_key DO NOTHING;

INSERT INTO bioquimica_referencia (bioquimica_exame_id, especie, faixa_etaria, metodo, valor_min, valor_max, unidade)
SELECT id, 'cao', 'todos', 'Cinético (IFCC)', 15.6, 45.2, 'U/L' FROM bioquimica_exames WHERE codigo = 'TGP'
ON CONFLICT ON CONSTRAINT bioquimica_referencia_exame_especie_faixa_metodo_key DO NOTHING;

INSERT INTO bioquimica_referencia (bioquimica_exame_id, especie, faixa_etaria, metodo, valor_min, valor_max, unidade)
SELECT id, 'cao', 'todos', 'Enzimático cinético (GLDH)', 27.1, 44.7, 'mg/dL' FROM bioquimica_exames WHERE codigo = 'UREIA'
ON CONFLICT ON CONSTRAINT bioquimica_referencia_exame_especie_faixa_metodo_key DO NOTHING;

INSERT INTO bioquimica_referencia (bioquimica_exame_id, especie, faixa_etaria, metodo, valor_min, valor_max, unidade)
SELECT id, 'cao', 'todos', 'Enzimático-colorimétrico (GPO-PAP)', 54, 108, 'mg/dL' FROM bioquimica_exames WHERE codigo = 'TRIG'
ON CONFLICT ON CONSTRAINT bioquimica_referencia_exame_especie_faixa_metodo_key DO NOTHING;

INSERT INTO bioquimica_referencia (bioquimica_exame_id, especie, faixa_etaria, metodo, valor_min, valor_max, unidade)
SELECT id, 'cao', 'todos', 'Colorimétrico (GOD-PAP)', 70, 120, 'mg/dL' FROM bioquimica_exames WHERE codigo = 'GLIC'
ON CONFLICT ON CONSTRAINT bioquimica_referencia_exame_especie_faixa_metodo_key DO NOTHING;

-- ── ESPÉCIE FELINA ──────────────────────────────────────────────
INSERT INTO bioquimica_referencia (bioquimica_exame_id, especie, faixa_etaria, metodo, valor_min, valor_max, unidade)
SELECT id, 'gato', 'todos', 'Cinético', 315, 1181, 'U/L' FROM bioquimica_exames WHERE codigo = 'AMIL'
ON CONFLICT ON CONSTRAINT bioquimica_referencia_exame_especie_faixa_metodo_key DO NOTHING;

INSERT INTO bioquimica_referencia (bioquimica_exame_id, especie, faixa_etaria, metodo, valor_min, valor_max, unidade)
SELECT id, 'gato', 'todos', 'Colorimétrico (BCG)', 2.1, 3.9, 'g/dL' FROM bioquimica_exames WHERE codigo = 'ALB'
ON CONFLICT ON CONSTRAINT bioquimica_referencia_exame_especie_faixa_metodo_key DO NOTHING;

INSERT INTO bioquimica_referencia (bioquimica_exame_id, especie, faixa_etaria, metodo, valor_min, valor_max, unidade)
SELECT id, 'gato', 'todos', 'Colorimétrico', 0.15, 0.5, 'mg/dL' FROM bioquimica_exames WHERE codigo = 'BILI'
ON CONFLICT ON CONSTRAINT bioquimica_referencia_exame_especie_faixa_metodo_key DO NOTHING;

INSERT INTO bioquimica_referencia (bioquimica_exame_id, especie, faixa_etaria, metodo, valor_min, valor_max, unidade)
SELECT id, 'gato', 'todos', 'Enzimático-colorimétrico', 92, 184, 'mg/dL' FROM bioquimica_exames WHERE codigo = 'COL'
ON CONFLICT ON CONSTRAINT bioquimica_referencia_exame_especie_faixa_metodo_key DO NOTHING;

INSERT INTO bioquimica_referencia (bioquimica_exame_id, especie, faixa_etaria, metodo, valor_min, valor_max, unidade)
SELECT id, 'gato', 'todos', 'Cinético-colorimétrico', 0.7, 1.8, 'mg/dL' FROM bioquimica_exames WHERE codigo = 'CREA'
ON CONFLICT ON CONSTRAINT bioquimica_referencia_exame_especie_faixa_metodo_key DO NOTHING;

INSERT INTO bioquimica_referencia (bioquimica_exame_id, especie, faixa_etaria, metodo, valor_min, valor_max, unidade)
SELECT id, 'gato', 'todos', 'Cinético otimizado', 33.3, 118.1, 'U/L' FROM bioquimica_exames WHERE codigo = 'FAL'
ON CONFLICT ON CONSTRAINT bioquimica_referencia_exame_especie_faixa_metodo_key DO NOTHING;

INSERT INTO bioquimica_referencia (bioquimica_exame_id, especie, faixa_etaria, metodo, valor_min, valor_max, unidade)
SELECT id, 'gato', 'todos', 'Cinético (IFCC)', 34.9, 74.3, 'U/L' FROM bioquimica_exames WHERE codigo = 'TGP'
ON CONFLICT ON CONSTRAINT bioquimica_referencia_exame_especie_faixa_metodo_key DO NOTHING;

INSERT INTO bioquimica_referencia (bioquimica_exame_id, especie, faixa_etaria, metodo, valor_min, valor_max, unidade)
SELECT id, 'gato', 'todos', 'Enzimático cinético (GLDH)', 47.9, 71.7, 'mg/dL' FROM bioquimica_exames WHERE codigo = 'UREIA'
ON CONFLICT ON CONSTRAINT bioquimica_referencia_exame_especie_faixa_metodo_key DO NOTHING;

INSERT INTO bioquimica_referencia (bioquimica_exame_id, especie, faixa_etaria, metodo, valor_min, valor_max, unidade)
SELECT id, 'gato', 'todos', 'Enzimático-colorimétrico (GPO-PAP)', 48, 104, 'mg/dL' FROM bioquimica_exames WHERE codigo = 'TRIG'
ON CONFLICT ON CONSTRAINT bioquimica_referencia_exame_especie_faixa_metodo_key DO NOTHING;

INSERT INTO bioquimica_referencia (bioquimica_exame_id, especie, faixa_etaria, metodo, valor_min, valor_max, unidade)
SELECT id, 'gato', 'todos', 'Colorimétrico (GOD-PAP)', 70, 150, 'mg/dL' FROM bioquimica_exames WHERE codigo = 'GLIC'
ON CONFLICT ON CONSTRAINT bioquimica_referencia_exame_especie_faixa_metodo_key DO NOTHING;

-- ── ESPÉCIE EQUINA ──────────────────────────────────────────────
INSERT INTO bioquimica_referencia (bioquimica_exame_id, especie, faixa_etaria, metodo, valor_min, valor_max, unidade)
SELECT id, 'equino', 'todos', 'Cinético', 75, 150, 'U/L' FROM bioquimica_exames WHERE codigo = 'AMIL'
ON CONFLICT ON CONSTRAINT bioquimica_referencia_exame_especie_faixa_metodo_key DO NOTHING;

INSERT INTO bioquimica_referencia (bioquimica_exame_id, especie, faixa_etaria, metodo, valor_min, valor_max, unidade)
SELECT id, 'equino', 'todos', 'BCG', 2.7, 3.7, 'g/dL' FROM bioquimica_exames WHERE codigo = 'ALB'
ON CONFLICT ON CONSTRAINT bioquimica_referencia_exame_especie_faixa_metodo_key DO NOTHING;

INSERT INTO bioquimica_referencia (bioquimica_exame_id, especie, faixa_etaria, metodo, valor_min, valor_max, unidade)
SELECT id, 'equino', 'todos', 'Colorimétrico', 1.0, 2.0, 'mg/dL' FROM bioquimica_exames WHERE codigo = 'BILI'
ON CONFLICT ON CONSTRAINT bioquimica_referencia_exame_especie_faixa_metodo_key DO NOTHING;

INSERT INTO bioquimica_referencia (bioquimica_exame_id, especie, faixa_etaria, metodo, valor_min, valor_max, unidade)
SELECT id, 'equino', 'todos', 'Enzimático-colorimétrico', 69, 95, 'mg/dL' FROM bioquimica_exames WHERE codigo = 'COL'
ON CONFLICT ON CONSTRAINT bioquimica_referencia_exame_especie_faixa_metodo_key DO NOTHING;

INSERT INTO bioquimica_referencia (bioquimica_exame_id, especie, faixa_etaria, metodo, valor_min, valor_max, unidade)
SELECT id, 'equino', 'todos', 'Cinético-colorimétrico', 1.2, 1.9, 'mg/dL' FROM bioquimica_exames WHERE codigo = 'CREA'
ON CONFLICT ON CONSTRAINT bioquimica_referencia_exame_especie_faixa_metodo_key DO NOTHING;

INSERT INTO bioquimica_referencia (bioquimica_exame_id, especie, faixa_etaria, metodo, valor_min, valor_max, unidade)
SELECT id, 'equino', 'todos', 'Cinético otimizado', 117, 311, 'U/L' FROM bioquimica_exames WHERE codigo = 'FAL'
ON CONFLICT ON CONSTRAINT bioquimica_referencia_exame_especie_faixa_metodo_key DO NOTHING;

INSERT INTO bioquimica_referencia (bioquimica_exame_id, especie, faixa_etaria, metodo, valor_min, valor_max, unidade)
SELECT id, 'equino', 'todos', 'IFCC', 3, 23, 'U/L' FROM bioquimica_exames WHERE codigo = 'TGP'
ON CONFLICT ON CONSTRAINT bioquimica_referencia_exame_especie_faixa_metodo_key DO NOTHING;

INSERT INTO bioquimica_referencia (bioquimica_exame_id, especie, faixa_etaria, metodo, valor_min, valor_max, unidade)
SELECT id, 'equino', 'todos', 'GLDH', 32.4, 45.5, 'mg/dL' FROM bioquimica_exames WHERE codigo = 'UREIA'
ON CONFLICT ON CONSTRAINT bioquimica_referencia_exame_especie_faixa_metodo_key DO NOTHING;

INSERT INTO bioquimica_referencia (bioquimica_exame_id, especie, faixa_etaria, metodo, valor_min, valor_max, unidade)
SELECT id, 'equino', 'todos', 'GPO-PAP', 26, 52, 'mg/dL' FROM bioquimica_exames WHERE codigo = 'TRIG'
ON CONFLICT ON CONSTRAINT bioquimica_referencia_exame_especie_faixa_metodo_key DO NOTHING;

-- ── ESPÉCIE BOVINA ──────────────────────────────────────────────
INSERT INTO bioquimica_referencia (bioquimica_exame_id, especie, faixa_etaria, metodo, valor_min, valor_max, unidade)
SELECT id, 'bovino', 'todos', 'BCG', 2.5, 4.3, 'g/dL' FROM bioquimica_exames WHERE codigo = 'ALB'
ON CONFLICT ON CONSTRAINT bioquimica_referencia_exame_especie_faixa_metodo_key DO NOTHING;

INSERT INTO bioquimica_referencia (bioquimica_exame_id, especie, faixa_etaria, metodo, valor_min, valor_max, unidade)
SELECT id, 'bovino', 'todos', 'Colorimétrico', 0.01, 0.5, 'mg/dL' FROM bioquimica_exames WHERE codigo = 'BILI'
ON CONFLICT ON CONSTRAINT bioquimica_referencia_exame_especie_faixa_metodo_key DO NOTHING;

INSERT INTO bioquimica_referencia (bioquimica_exame_id, especie, faixa_etaria, metodo, valor_min, valor_max, unidade)
SELECT id, 'bovino', 'todos', 'Enzimático-colorimétrico', 37, 61, 'mg/dL' FROM bioquimica_exames WHERE codigo = 'COL'
ON CONFLICT ON CONSTRAINT bioquimica_referencia_exame_especie_faixa_metodo_key DO NOTHING;

INSERT INTO bioquimica_referencia (bioquimica_exame_id, especie, faixa_etaria, metodo, valor_min, valor_max, unidade)
SELECT id, 'bovino', 'todos', 'Cinético-colorimétrico', 1.0, 1.8, 'mg/dL' FROM bioquimica_exames WHERE codigo = 'CREA'
ON CONFLICT ON CONSTRAINT bioquimica_referencia_exame_especie_faixa_metodo_key DO NOTHING;

INSERT INTO bioquimica_referencia (bioquimica_exame_id, especie, faixa_etaria, metodo, valor_min, valor_max, unidade)
SELECT id, 'bovino', 'todos', 'Cinético otimizado', 0, 488, 'U/L' FROM bioquimica_exames WHERE codigo = 'FAL'
ON CONFLICT ON CONSTRAINT bioquimica_referencia_exame_especie_faixa_metodo_key DO NOTHING;

INSERT INTO bioquimica_referencia (bioquimica_exame_id, especie, faixa_etaria, metodo, valor_min, valor_max, unidade)
SELECT id, 'bovino', 'todos', 'IFCC', 11, 40, 'U/L' FROM bioquimica_exames WHERE codigo = 'TGP'
ON CONFLICT ON CONSTRAINT bioquimica_referencia_exame_especie_faixa_metodo_key DO NOTHING;

INSERT INTO bioquimica_referencia (bioquimica_exame_id, especie, faixa_etaria, metodo, valor_min, valor_max, unidade)
SELECT id, 'bovino', 'todos', 'GLDH', 9.3, 31.5, 'mg/dL' FROM bioquimica_exames WHERE codigo = 'UREIA'
ON CONFLICT ON CONSTRAINT bioquimica_referencia_exame_especie_faixa_metodo_key DO NOTHING;

INSERT INTO bioquimica_referencia (bioquimica_exame_id, especie, faixa_etaria, metodo, valor_min, valor_max, unidade)
SELECT id, 'bovino', 'todos', 'GPO-PAP', 16, 55, 'mg/dL' FROM bioquimica_exames WHERE codigo = 'TRIG'
ON CONFLICT ON CONSTRAINT bioquimica_referencia_exame_especie_faixa_metodo_key DO NOTHING;

-- ── ESPÉCIE OVINA ───────────────────────────────────────────────
INSERT INTO bioquimica_referencia (bioquimica_exame_id, especie, faixa_etaria, metodo, valor_min, valor_max, unidade)
SELECT id, 'ovino', 'todos', 'BCG', 3.2, 3.8, 'g/dL' FROM bioquimica_exames WHERE codigo = 'ALB'
ON CONFLICT ON CONSTRAINT bioquimica_referencia_exame_especie_faixa_metodo_key DO NOTHING;

INSERT INTO bioquimica_referencia (bioquimica_exame_id, especie, faixa_etaria, metodo, valor_min, valor_max, unidade)
SELECT id, 'ovino', 'todos', 'Colorimétrico', 0.1, 0.2, 'mg/dL' FROM bioquimica_exames WHERE codigo = 'BILI'
ON CONFLICT ON CONSTRAINT bioquimica_referencia_exame_especie_faixa_metodo_key DO NOTHING;

INSERT INTO bioquimica_referencia (bioquimica_exame_id, especie, faixa_etaria, metodo, valor_min, valor_max, unidade)
SELECT id, 'ovino', 'todos', 'Enzimático-colorimétrico', 52, 76, 'mg/dL' FROM bioquimica_exames WHERE codigo = 'COL'
ON CONFLICT ON CONSTRAINT bioquimica_referencia_exame_especie_faixa_metodo_key DO NOTHING;

INSERT INTO bioquimica_referencia (bioquimica_exame_id, especie, faixa_etaria, metodo, valor_min, valor_max, unidade)
SELECT id, 'ovino', 'todos', 'Cinético-colorimétrico', 1.2, 1.9, 'mg/dL' FROM bioquimica_exames WHERE codigo = 'CREA'
ON CONFLICT ON CONSTRAINT bioquimica_referencia_exame_especie_faixa_metodo_key DO NOTHING;

INSERT INTO bioquimica_referencia (bioquimica_exame_id, especie, faixa_etaria, metodo, valor_min, valor_max, unidade)
SELECT id, 'ovino', 'todos', 'Cinético otimizado', 68, 387, 'U/L' FROM bioquimica_exames WHERE codigo = 'FAL'
ON CONFLICT ON CONSTRAINT bioquimica_referencia_exame_especie_faixa_metodo_key DO NOTHING;

INSERT INTO bioquimica_referencia (bioquimica_exame_id, especie, faixa_etaria, metodo, valor_min, valor_max, unidade)
SELECT id, 'ovino', 'todos', 'IFCC', 6.0, 19.0, 'U/L' FROM bioquimica_exames WHERE codigo = 'TGP'
ON CONFLICT ON CONSTRAINT bioquimica_referencia_exame_especie_faixa_metodo_key DO NOTHING;

INSERT INTO bioquimica_referencia (bioquimica_exame_id, especie, faixa_etaria, metodo, valor_min, valor_max, unidade)
SELECT id, 'ovino', 'todos', 'GLDH', 17.12, 42.8, 'mg/dL' FROM bioquimica_exames WHERE codigo = 'UREIA'
ON CONFLICT ON CONSTRAINT bioquimica_referencia_exame_especie_faixa_metodo_key DO NOTHING;

-- ── ESPÉCIE CAPRINA ─────────────────────────────────────────────
INSERT INTO bioquimica_referencia (bioquimica_exame_id, especie, faixa_etaria, metodo, valor_min, valor_max, unidade)
SELECT id, 'caprino', 'todos', 'BCG', 2.7, 3.7, 'g/dL' FROM bioquimica_exames WHERE codigo = 'ALB'
ON CONFLICT ON CONSTRAINT bioquimica_referencia_exame_especie_faixa_metodo_key DO NOTHING;

INSERT INTO bioquimica_referencia (bioquimica_exame_id, especie, faixa_etaria, metodo, valor_min, valor_max, unidade)
SELECT id, 'caprino', 'todos', 'Colorimétrico', 0, 0.1, 'mg/dL' FROM bioquimica_exames WHERE codigo = 'BILI'
ON CONFLICT ON CONSTRAINT bioquimica_referencia_exame_especie_faixa_metodo_key DO NOTHING;

INSERT INTO bioquimica_referencia (bioquimica_exame_id, especie, faixa_etaria, metodo, valor_min, valor_max, unidade)
SELECT id, 'caprino', 'todos', 'Enzimático-colorimétrico', 80, 130, 'mg/dL' FROM bioquimica_exames WHERE codigo = 'COL'
ON CONFLICT ON CONSTRAINT bioquimica_referencia_exame_especie_faixa_metodo_key DO NOTHING;

INSERT INTO bioquimica_referencia (bioquimica_exame_id, especie, faixa_etaria, metodo, valor_min, valor_max, unidade)
SELECT id, 'caprino', 'todos', 'Cinético-colorimétrico', 0.7, 1.0, 'mg/dL' FROM bioquimica_exames WHERE codigo = 'CREA'
ON CONFLICT ON CONSTRAINT bioquimica_referencia_exame_especie_faixa_metodo_key DO NOTHING;

INSERT INTO bioquimica_referencia (bioquimica_exame_id, especie, faixa_etaria, metodo, valor_min, valor_max, unidade)
SELECT id, 'caprino', 'todos', 'Cinético otimizado', 93, 387, 'U/L' FROM bioquimica_exames WHERE codigo = 'FAL'
ON CONFLICT ON CONSTRAINT bioquimica_referencia_exame_especie_faixa_metodo_key DO NOTHING;

INSERT INTO bioquimica_referencia (bioquimica_exame_id, especie, faixa_etaria, metodo, valor_min, valor_max, unidade)
SELECT id, 'caprino', 'todos', 'IFCC', 24, 83, 'U/L' FROM bioquimica_exames WHERE codigo = 'TGP'
ON CONFLICT ON CONSTRAINT bioquimica_referencia_exame_especie_faixa_metodo_key DO NOTHING;

INSERT INTO bioquimica_referencia (bioquimica_exame_id, especie, faixa_etaria, metodo, valor_min, valor_max, unidade)
SELECT id, 'caprino', 'todos', 'GLDH', 21.4, 42.8, 'mg/dL' FROM bioquimica_exames WHERE codigo = 'UREIA'
ON CONFLICT ON CONSTRAINT bioquimica_referencia_exame_especie_faixa_metodo_key DO NOTHING;

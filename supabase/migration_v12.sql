-- migration_v12: Sub-exames de bioquímica (Mindray BS-200)

-- Tabela de sub-exames de bioquímica
CREATE TABLE IF NOT EXISTS bioquimica_exames (
  id           SERIAL PRIMARY KEY,
  nome         TEXT          NOT NULL,
  codigo       TEXT,
  preco_pix    NUMERIC(10,2) NOT NULL DEFAULT 0,
  preco_cartao NUMERIC(10,2) NOT NULL DEFAULT 0,
  ativo        BOOLEAN       DEFAULT TRUE,
  ordem        INTEGER       DEFAULT 0,
  criado_em    TIMESTAMP     DEFAULT NOW()
);

-- Vincula sub-exames ao agendamento (snapshot de preço)
CREATE TABLE IF NOT EXISTS agendamento_bioquimica (
  id                   SERIAL PRIMARY KEY,
  agendamento_id       INTEGER REFERENCES agendamentos(id) ON DELETE CASCADE,
  bioquimica_exame_id  INTEGER REFERENCES bioquimica_exames(id),
  valor_pix            NUMERIC(10,2) NOT NULL,
  valor_cartao         NUMERIC(10,2) NOT NULL
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_agendamento_bioquimica_agendamento ON agendamento_bioquimica(agendamento_id);

-- Adiciona "Bioquímica" como tipo de exame em comissoes_exame
-- (preço 0 — o preço real vem dos sub-exames em bioquimica_exames)
INSERT INTO comissoes_exame (tipo_exame, preco_exame, custo_exame, valor_comissao, varia_por_horario, duracao_minutos, observacao)
VALUES ('Bioquímica', 0, 0, 0, false, 30, 'Preço individual por sub-exame — configurar em Bioquímica')
ON CONFLICT (tipo_exame) DO NOTHING;

-- Seed com exames conhecidos da Mindray BS-200 (preços zerados — preencher no painel)
INSERT INTO bioquimica_exames (nome, codigo, preco_pix, preco_cartao, ordem) VALUES
  ('TGP (ALT)',         'TGP',   0, 0, 1),
  ('TGO (AST)',         'TGO',   0, 0, 2),
  ('Alfa Amilase',      'AMIL',  0, 0, 3),
  ('Colesterol Total',  'COL',   0, 0, 4),
  ('Creatinina',        'CREA',  0, 0, 5),
  ('Fosfatase Alcalina','FAL',   0, 0, 6),
  ('Glicose',           'GLIC',  0, 0, 7),
  ('Triglicerídeos',    'TRIG',  0, 0, 8),
  ('Ureia',             'UREIA', 0, 0, 9)
ON CONFLICT DO NOTHING;

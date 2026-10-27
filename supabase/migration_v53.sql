-- Migration v53: Urinálise (analisador de urina URIT UC-32B)
--
-- A máquina não conversa com o computador: a equipe tira foto da tela ou da
-- impressão e o Gemini lê os valores (src/lib/ler-urina-foto.ts). Dois tipos
-- de fita: URIT 11G (11 parâmetros) e URIT 14G (14 parâmetros: + microalbumina,
-- cálcio e creatinina, e a máquina calcula a relação albumina/creatinina).
--
-- 1. Os dois exames em comissoes_exame — nascem INATIVOS e com preço 0: só
--    aparecem no agendamento (painel e IA) depois que alguém põe o preço e liga
--    "Ativo" em Preços › Exames.
-- 2. urinalise_referencia — referência da parte química por espécie, editável
--    em /admin/urinalise/referencias. `parametro` é o código de
--    src/lib/urinalise.ts (LEU, KET, NIT, URO, BIL, GLU, PRO, SG, PH, BLD, VC,
--    MA, CA, CR, ACR). Resultado acima do máximo ou abaixo do mínimo sai como
--    "Alterado" no laudo. Qualitativos (nitrito): Negativo = 0, Positivo = 1.
--    Seed com valores de literatura veterinária para fita reagente — REVISAR
--    com a Andreza antes de usar.
-- 3. exame_consumiveis — exame (pelo nome em comissoes_exame) → consumível,
--    com quantidade. Seed: cada urinálise gasta 1 fita do seu tipo.
--
-- Roda uma vez. Idempotente.

BEGIN;

-- 1. Exames
INSERT INTO comissoes_exame (tipo_exame, preco_pix_comercial, custo_exame, valor_comissao,
                             varia_por_horario, duracao_minutos, observacao, ativo)
VALUES
  ('Urinálise (11 parâmetros)', 0, 0, 0, false, 15, 'Fita URIT 11G — configurar preço antes de ativar', false),
  ('Urinálise (14 parâmetros)', 0, 0, 0, false, 15, 'Fita URIT 14G — configurar preço antes de ativar', false)
ON CONFLICT (tipo_exame) DO NOTHING;

-- 2. Referências
CREATE TABLE IF NOT EXISTS urinalise_referencia (
  id         SERIAL PRIMARY KEY,
  parametro  TEXT NOT NULL,
  especie    TEXT NOT NULL,
  valor_min  NUMERIC(10,4),
  valor_max  NUMERIC(10,4),
  criado_em  TIMESTAMP DEFAULT NOW(),
  UNIQUE (parametro, especie)
);

ALTER TABLE urinalise_referencia ENABLE ROW LEVEL SECURITY;

INSERT INTO urinalise_referencia (parametro, especie, valor_min, valor_max) VALUES
  -- Cão
  ('LEU', 'cao', NULL,  0),       -- leu/µL; fita tem falso-negativo em cão
  ('KET', 'cao', NULL,  0),       -- mg/dL
  ('NIT', 'cao', NULL,  0),       -- Negativo
  ('URO', 'cao', NULL,  1),       -- mg/dL ("Normal" na máquina)
  ('BIL', 'cao', NULL,  1),       -- mg/dL; traços a 1+ podem ser normais em cão (urina concentrada)
  ('GLU', 'cao', NULL,  0),       -- mg/dL
  ('PRO', 'cao', NULL, 30),       -- mg/dL; traços a 1+ podem ser normais em urina concentrada
  ('SG',  'cao', 1.015, 1.045),
  ('PH',  'cao', 5.5,   7.5),
  ('BLD', 'cao', NULL,  0),       -- mg/dL
  ('MA',  'cao', NULL,  1),       -- mg/dL
  -- Gato
  ('KET', 'gato', NULL,  0),
  ('NIT', 'gato', NULL,  0),
  ('URO', 'gato', NULL,  1),
  ('BIL', 'gato', NULL,  0),      -- em gato qualquer bilirrubina é anormal
  ('GLU', 'gato', NULL,  0),
  ('PRO', 'gato', NULL, 30),
  ('SG',  'gato', 1.035, 1.060),
  ('PH',  'gato', 6.0,   7.5),
  ('BLD', 'gato', NULL,  0),
  ('MA',  'gato', NULL,  1)
  -- LEU em gato fica sem referência: a fita dá falso-positivo na espécie.
  -- Vc (ácido ascórbico), Ca, CR e ACR sem referência: o laudo mostra só o valor.
ON CONFLICT (parametro, especie) DO NOTHING;

-- 3. Consumo de estoque por exame
CREATE TABLE IF NOT EXISTS exame_consumiveis (
  tipo_exame    TEXT    NOT NULL REFERENCES comissoes_exame(tipo_exame) ON UPDATE CASCADE ON DELETE CASCADE,
  consumivel_id INTEGER NOT NULL REFERENCES consumiveis(id),
  quantidade    INTEGER NOT NULL DEFAULT 1 CHECK (quantidade > 0),
  PRIMARY KEY (tipo_exame, consumivel_id)
);

CREATE INDEX IF NOT EXISTS idx_exame_consumiveis_consumivel ON exame_consumiveis(consumivel_id);

ALTER TABLE exame_consumiveis ENABLE ROW LEVEL SECURITY;

INSERT INTO consumiveis (nome, unidade, categoria)
SELECT v.nome, 'fita', 'reagente'
  FROM (VALUES ('Fita de urina URIT 11G'), ('Fita de urina URIT 14G')) AS v(nome)
 WHERE NOT EXISTS (SELECT 1 FROM consumiveis c WHERE c.nome = v.nome);

INSERT INTO exame_consumiveis (tipo_exame, consumivel_id, quantidade)
SELECT e.tipo_exame, c.id, 1
  FROM (VALUES ('Urinálise (11 parâmetros)', 'Fita de urina URIT 11G'),
               ('Urinálise (14 parâmetros)', 'Fita de urina URIT 14G')) AS e(tipo_exame, fita)
  JOIN consumiveis c ON c.nome = e.fita
ON CONFLICT DO NOTHING;

COMMIT;

-- Conferência:
-- SELECT tipo_exame, preco_pix_comercial, ativo FROM comissoes_exame WHERE tipo_exame ILIKE 'urin%';
-- SELECT * FROM urinalise_referencia ORDER BY especie, parametro;
-- SELECT v.tipo_exame, c.nome, v.quantidade FROM exame_consumiveis v JOIN consumiveis c ON c.id = v.consumivel_id;

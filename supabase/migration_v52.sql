-- Migration v52: PCR também gasta estoque de consumíveis
--
-- Pré-requisitos: v44 e v45 (estoque de consumíveis) e v50 (catálogo exames_pcr).
--
-- Diferente do teste rápido (1 kit por teste, testes_rapidos.consumivel_id), um
-- PCR pode gastar mais de um kit (ex.: um painel que roda vários kits). Por isso
-- o vínculo é uma tabela PCR → consumível com quantidade, editável em Estoque.
--
-- consumiveis.codigo guarda o código do kit do fornecedor (o mesmo de
-- exames_pcr.codigo, ex.: "PC05-0") — é o que está na nota fiscal.
--
-- 1. consumiveis.codigo
-- 2. exame_pcr_consumiveis (PCR → kit, quantidade por exame)
-- 3. Seed: um consumível por código de kit do catálogo, vinculado ao PCR do
--    mesmo código. "FIV e FeLV" tem kit próprio (uma caixa faz os dois) e,
--    como não tem código no catálogo, ganha um consumível pelo nome.
--    Os demais PCRs sem código (ex.: Anaplasma platys, painéis) ficam
--    SEM vínculo — configurar na tela de Estoque.

BEGIN;

ALTER TABLE consumiveis
  ADD COLUMN IF NOT EXISTS codigo TEXT;

CREATE TABLE IF NOT EXISTS exame_pcr_consumiveis (
  pcr_id        INTEGER NOT NULL REFERENCES exames_pcr(id) ON DELETE CASCADE,
  consumivel_id INTEGER NOT NULL REFERENCES consumiveis(id),
  quantidade    INTEGER NOT NULL DEFAULT 1 CHECK (quantidade > 0),
  PRIMARY KEY (pcr_id, consumivel_id)
);

CREATE INDEX IF NOT EXISTS idx_exame_pcr_consumiveis_consumivel
  ON exame_pcr_consumiveis(consumivel_id);

-- Acesso só pelo service role (server-side), igual às demais tabelas.
ALTER TABLE exame_pcr_consumiveis ENABLE ROW LEVEL SECURITY;

-- Um consumível por código de kit (idempotente: não duplica se já existir)
INSERT INTO consumiveis (nome, unidade, categoria, codigo)
SELECT DISTINCT ON (p.codigo) 'Kit PCR ' || p.nome, 'teste', 'pcr', p.codigo
  FROM exames_pcr p
 WHERE p.codigo IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM consumiveis c WHERE c.codigo = p.codigo)
 ORDER BY p.codigo, p.id;

-- PCR com código → kit do mesmo código
INSERT INTO exame_pcr_consumiveis (pcr_id, consumivel_id, quantidade)
SELECT p.id, c.id, 1
  FROM exames_pcr p
  JOIN consumiveis c ON c.codigo = p.codigo
ON CONFLICT DO NOTHING;

-- "FIV e FeLV": kit próprio (uma caixa faz os dois), sem código no catálogo
INSERT INTO consumiveis (nome, unidade, categoria)
SELECT 'Kit PCR FIV e FeLV', 'teste', 'pcr'
 WHERE EXISTS (SELECT 1 FROM exames_pcr WHERE nome = 'FIV e FeLV' AND codigo IS NULL)
   AND NOT EXISTS (SELECT 1 FROM consumiveis WHERE nome = 'Kit PCR FIV e FeLV');

INSERT INTO exame_pcr_consumiveis (pcr_id, consumivel_id, quantidade)
SELECT p.id, c.id, 1
  FROM exames_pcr p
  JOIN consumiveis c ON c.nome = 'Kit PCR FIV e FeLV'
 WHERE p.nome = 'FIV e FeLV' AND p.codigo IS NULL
ON CONFLICT DO NOTHING;

COMMIT;

-- Conferência:
-- SELECT p.nome, c.nome AS kit, v.quantidade
--   FROM exames_pcr p
--   LEFT JOIN exame_pcr_consumiveis v ON v.pcr_id = p.id
--   LEFT JOIN consumiveis c ON c.id = v.consumivel_id
--  ORDER BY p.ordem;

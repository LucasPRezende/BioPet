-- Migration v52: PCR também gasta estoque de consumíveis
--
-- Pré-requisitos: v44 e v45 (estoque de consumíveis) e v50 (catálogo exames_pcr).
--
-- Cada PCR gasta o SEU kit (uma reação) e cada amostra gasta UMA extração de
-- DNA/RNA (o extrator). Laudo com 3 PCRs da mesma amostra = 3 kits + 1
-- extração. Se o extraído guardado na geladeira for reaproveitado (PCR no dia
-- seguinte), quem emite o laudo desmarca "Usou extração nova" e o extrator não
-- sai de novo.
--
-- O vínculo PCR → kit é uma tabela com quantidade (e não uma coluna, como no
-- teste rápido) para permitir, se um dia precisar, um PCR que gaste mais de um
-- kit. Editável na tela de Estoque.
--
-- 1. consumiveis.codigo       → código do kit do fornecedor (o da nota fiscal)
--    consumiveis.extrator_pcr → marca o extrator de DNA/RNA (no máximo um)
-- 2. exame_pcr_consumiveis (PCR → kit, quantidade por exame)
-- 3. Seed: um kit por PCR do catálogo (pelo código quando tem; pelo nome quando
--    não tem, ex.: "FIV e FeLV", que é uma caixa própria) e o extrator.
--    Idempotente: rodar de novo não duplica nada.

BEGIN;

ALTER TABLE consumiveis
  ADD COLUMN IF NOT EXISTS codigo       TEXT,
  ADD COLUMN IF NOT EXISTS extrator_pcr BOOLEAN NOT NULL DEFAULT FALSE;

-- Só um consumível pode ser o extrator
CREATE UNIQUE INDEX IF NOT EXISTS uq_consumiveis_extrator_pcr
  ON consumiveis (extrator_pcr) WHERE extrator_pcr;

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

-- Kit dos PCRs com código: um por código
INSERT INTO consumiveis (nome, unidade, categoria, codigo)
SELECT DISTINCT ON (p.codigo) 'Kit PCR ' || p.nome, 'teste', 'pcr', p.codigo
  FROM exames_pcr p
 WHERE p.codigo IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM consumiveis c WHERE c.codigo = p.codigo)
 ORDER BY p.codigo, p.id;

INSERT INTO exame_pcr_consumiveis (pcr_id, consumivel_id, quantidade)
SELECT p.id, c.id, 1
  FROM exames_pcr p
  JOIN consumiveis c ON c.codigo = p.codigo
ON CONFLICT DO NOTHING;

-- Kit dos PCRs sem código no catálogo (ex.: "FIV e FeLV", painéis): pelo nome
INSERT INTO consumiveis (nome, unidade, categoria)
SELECT 'Kit PCR ' || p.nome, 'teste', 'pcr'
  FROM exames_pcr p
 WHERE p.codigo IS NULL
   AND NOT EXISTS (SELECT 1 FROM consumiveis c WHERE c.nome = 'Kit PCR ' || p.nome);

INSERT INTO exame_pcr_consumiveis (pcr_id, consumivel_id, quantidade)
SELECT p.id, c.id, 1
  FROM exames_pcr p
  JOIN consumiveis c ON c.nome = 'Kit PCR ' || p.nome AND c.codigo IS NULL
 WHERE p.codigo IS NULL
ON CONFLICT DO NOTHING;

-- Extrator de DNA/RNA: 1 por amostra (laudo de PCR)
INSERT INTO consumiveis (nome, unidade, categoria, extrator_pcr)
SELECT 'Extrator de DNA/RNA', 'extração', 'pcr', TRUE
 WHERE NOT EXISTS (SELECT 1 FROM consumiveis WHERE extrator_pcr);

COMMIT;

-- Conferência:
-- SELECT p.nome, c.nome AS kit, v.quantidade
--   FROM exames_pcr p
--   LEFT JOIN exame_pcr_consumiveis v ON v.pcr_id = p.id
--   LEFT JOIN consumiveis c ON c.id = v.consumivel_id
--  ORDER BY p.ordem;
-- SELECT id, nome FROM consumiveis WHERE extrator_pcr;

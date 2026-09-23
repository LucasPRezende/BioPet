-- Migration v44: Controle de estoque de consumíveis (custo por lote / PEPS)
--
-- Hoje o único consumível é o kit de teste rápido, mas o modelo é genérico.
--
--   consumiveis            → o item (ex.: "Snap 4Dx Plus"), com estoque mínimo p/ alerta
--   consumivel_compras     → cada compra é um LOTE: quantidade, valor pago e o
--                            saldo que ainda resta dele. O custo unitário é o do lote.
--   consumivel_movimentos  → cada saída (consumo em laudo ou baixa manual), com o
--                            lote de onde saiu e o custo unitário daquele lote.
--   testes_rapidos.consumivel_id → qual consumível o teste gasta (1 unidade por teste)
--
-- Custo: PEPS (primeiro que entra, primeiro que sai). Enquanto o lote mais antigo
-- tiver saldo, o custo sai dele; acabou, passa para o próximo. O custo do laudo
-- (laudos.custo_exame) é a soma das saídas vinculadas a ele — é o que o Dashboard
-- já usa para calcular o lucro.
--
-- Saída sem estoque: o laudo NUNCA é bloqueado por falta de estoque. A saída fica
-- "pendente" (compra_id NULL) com o custo da última compra como estimativa, o
-- estoque fica negativo (e aparece no alerta), e quando a próxima compra é lançada
-- as pendências são quitadas com o custo real do novo lote (e o custo dos laudos
-- é recalculado).
--
-- A lógica de lote fica em funções SQL para rodar numa transação só, com lock no
-- consumível (duas emissões ao mesmo tempo não tiram do mesmo saldo).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Tabelas
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS consumiveis (
  id              SERIAL PRIMARY KEY,
  nome            TEXT        NOT NULL,
  unidade         TEXT        NOT NULL DEFAULT 'un',
  estoque_minimo  INTEGER     NOT NULL DEFAULT 0,
  ativo           BOOLEAN     NOT NULL DEFAULT TRUE,
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS consumivel_compras (
  id              SERIAL PRIMARY KEY,
  consumivel_id   INTEGER       NOT NULL REFERENCES consumiveis(id),
  data_compra     DATE          NOT NULL DEFAULT CURRENT_DATE,
  quantidade      INTEGER       NOT NULL CHECK (quantidade > 0),
  valor_total     NUMERIC(12,2) NOT NULL CHECK (valor_total >= 0),
  custo_unitario  NUMERIC(12,4) GENERATED ALWAYS AS (ROUND(valor_total / quantidade, 4)) STORED,
  saldo           INTEGER       NOT NULL CHECK (saldo >= 0),
  fornecedor      TEXT,
  validade        DATE,
  observacao      TEXT,
  system_user_id  INTEGER REFERENCES system_users(id),
  criado_em       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CHECK (saldo <= quantidade)
);

CREATE INDEX IF NOT EXISTS idx_consumivel_compras_lote
  ON consumivel_compras(consumivel_id, data_compra, id);

CREATE TABLE IF NOT EXISTS consumivel_movimentos (
  id              SERIAL PRIMARY KEY,
  consumivel_id   INTEGER       NOT NULL REFERENCES consumiveis(id),
  compra_id       INTEGER REFERENCES consumivel_compras(id),   -- NULL = saiu sem estoque (pendente)
  tipo            TEXT          NOT NULL CHECK (tipo IN ('consumo', 'perda')),
  quantidade      INTEGER       NOT NULL CHECK (quantidade > 0),
  custo_unitario  NUMERIC(12,4) NOT NULL DEFAULT 0,
  laudo_id        INTEGER REFERENCES laudos(id),
  observacao      TEXT,
  system_user_id  INTEGER REFERENCES system_users(id),
  criado_em       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_consumivel_movimentos_consumivel
  ON consumivel_movimentos(consumivel_id, criado_em);
CREATE INDEX IF NOT EXISTS idx_consumivel_movimentos_laudo
  ON consumivel_movimentos(laudo_id) WHERE laudo_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_consumivel_movimentos_pendentes
  ON consumivel_movimentos(consumivel_id) WHERE compra_id IS NULL;

ALTER TABLE testes_rapidos
  ADD COLUMN IF NOT EXISTS consumivel_id INTEGER REFERENCES consumiveis(id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Saída de estoque (consumo em laudo ou baixa manual), PEPS
--    Devolve o custo total da saída.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION consumir_estoque(
  p_consumivel_id INTEGER,
  p_quantidade    INTEGER,
  p_tipo          TEXT,
  p_laudo_id      INTEGER DEFAULT NULL,
  p_observacao    TEXT    DEFAULT NULL,
  p_user_id       INTEGER DEFAULT NULL
) RETURNS NUMERIC
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_restante     INTEGER := p_quantidade;
  v_lote         RECORD;
  v_tira         INTEGER;
  v_custo        NUMERIC := 0;
  v_ultimo_custo NUMERIC;
BEGIN
  IF p_quantidade IS NULL OR p_quantidade <= 0 THEN
    RAISE EXCEPTION 'Quantidade inválida.';
  END IF;
  IF p_tipo NOT IN ('consumo', 'perda') THEN
    RAISE EXCEPTION 'Tipo de saída inválido: %', p_tipo;
  END IF;

  -- Serializa as operações de estoque deste consumível
  PERFORM 1 FROM consumiveis WHERE id = p_consumivel_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Consumível % não existe.', p_consumivel_id;
  END IF;

  FOR v_lote IN
    SELECT id, saldo, custo_unitario
      FROM consumivel_compras
     WHERE consumivel_id = p_consumivel_id AND saldo > 0
     ORDER BY data_compra, id
       FOR UPDATE
  LOOP
    EXIT WHEN v_restante = 0;
    v_tira := LEAST(v_restante, v_lote.saldo);

    UPDATE consumivel_compras SET saldo = saldo - v_tira WHERE id = v_lote.id;
    INSERT INTO consumivel_movimentos
      (consumivel_id, compra_id, tipo, quantidade, custo_unitario, laudo_id, observacao, system_user_id)
    VALUES
      (p_consumivel_id, v_lote.id, p_tipo, v_tira, v_lote.custo_unitario, p_laudo_id, p_observacao, p_user_id);

    v_custo    := v_custo + v_tira * v_lote.custo_unitario;
    v_restante := v_restante - v_tira;
  END LOOP;

  -- Sem estoque suficiente: registra como pendente com o custo da última compra
  IF v_restante > 0 THEN
    SELECT custo_unitario INTO v_ultimo_custo
      FROM consumivel_compras
     WHERE consumivel_id = p_consumivel_id
     ORDER BY data_compra DESC, id DESC
     LIMIT 1;

    INSERT INTO consumivel_movimentos
      (consumivel_id, compra_id, tipo, quantidade, custo_unitario, laudo_id, observacao, system_user_id)
    VALUES
      (p_consumivel_id, NULL, p_tipo, v_restante, COALESCE(v_ultimo_custo, 0), p_laudo_id, p_observacao, p_user_id);

    v_custo := v_custo + v_restante * COALESCE(v_ultimo_custo, 0);
  END IF;

  RETURN ROUND(v_custo, 2);
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Entrada (compra = novo lote). Quita saídas pendentes com o custo real do
--    lote e recalcula o custo dos laudos afetados. Devolve o id da compra.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION registrar_compra_consumivel(
  p_consumivel_id INTEGER,
  p_data_compra   DATE,
  p_quantidade    INTEGER,
  p_valor_total   NUMERIC,
  p_fornecedor    TEXT    DEFAULT NULL,
  p_validade      DATE    DEFAULT NULL,
  p_observacao    TEXT    DEFAULT NULL,
  p_user_id       INTEGER DEFAULT NULL
) RETURNS INTEGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_compra_id INTEGER;
  v_custo     NUMERIC;
  v_saldo     INTEGER := p_quantidade;
  v_mov       RECORD;
  v_tira      INTEGER;
  v_laudos    INTEGER[] := '{}';
BEGIN
  IF p_quantidade IS NULL OR p_quantidade <= 0 THEN
    RAISE EXCEPTION 'Quantidade inválida.';
  END IF;
  IF p_valor_total IS NULL OR p_valor_total < 0 THEN
    RAISE EXCEPTION 'Valor inválido.';
  END IF;

  PERFORM 1 FROM consumiveis WHERE id = p_consumivel_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Consumível % não existe.', p_consumivel_id;
  END IF;

  INSERT INTO consumivel_compras
    (consumivel_id, data_compra, quantidade, valor_total, saldo, fornecedor, validade, observacao, system_user_id)
  VALUES
    (p_consumivel_id, COALESCE(p_data_compra, CURRENT_DATE), p_quantidade, p_valor_total, p_quantidade,
     p_fornecedor, p_validade, p_observacao, p_user_id)
  RETURNING id, custo_unitario INTO v_compra_id, v_custo;

  FOR v_mov IN
    SELECT id, quantidade, laudo_id
      FROM consumivel_movimentos
     WHERE consumivel_id = p_consumivel_id AND compra_id IS NULL
     ORDER BY criado_em, id
       FOR UPDATE
  LOOP
    EXIT WHEN v_saldo = 0;
    v_tira := LEAST(v_saldo, v_mov.quantidade);

    -- Quitação parcial: o que não coube neste lote continua pendente
    IF v_tira < v_mov.quantidade THEN
      INSERT INTO consumivel_movimentos
        (consumivel_id, compra_id, tipo, quantidade, custo_unitario, laudo_id, observacao, system_user_id, criado_em)
      SELECT consumivel_id, NULL, tipo, quantidade - v_tira, custo_unitario, laudo_id, observacao, system_user_id, criado_em
        FROM consumivel_movimentos WHERE id = v_mov.id;
    END IF;

    UPDATE consumivel_movimentos
       SET compra_id = v_compra_id, quantidade = v_tira, custo_unitario = v_custo
     WHERE id = v_mov.id;

    v_saldo := v_saldo - v_tira;
    IF v_mov.laudo_id IS NOT NULL THEN
      v_laudos := array_append(v_laudos, v_mov.laudo_id);
    END IF;
  END LOOP;

  UPDATE consumivel_compras SET saldo = v_saldo WHERE id = v_compra_id;

  IF array_length(v_laudos, 1) > 0 THEN
    UPDATE laudos l
       SET custo_exame = (
         SELECT ROUND(COALESCE(SUM(m.quantidade * m.custo_unitario), 0), 2)
           FROM consumivel_movimentos m
          WHERE m.laudo_id = l.id AND m.tipo = 'consumo'
       )
     WHERE l.id = ANY(v_laudos);
  END IF;

  RETURN v_compra_id;
END;
$$;

-- Só o servidor (service role) chama estas funções
REVOKE EXECUTE ON FUNCTION consumir_estoque(INTEGER, INTEGER, TEXT, INTEGER, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION registrar_compra_consumivel(INTEGER, DATE, INTEGER, NUMERIC, TEXT, DATE, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION consumir_estoque(INTEGER, INTEGER, TEXT, INTEGER, TEXT, INTEGER) TO service_role;
GRANT  EXECUTE ON FUNCTION registrar_compra_consumivel(INTEGER, DATE, INTEGER, NUMERIC, TEXT, DATE, TEXT, INTEGER) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Seed: um consumível por teste rápido ativo, já vinculado (estoque zerado —
--    lançar a primeira compra / o estoque atual em Estoque › Compras)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO consumiveis (nome, unidade)
SELECT t.nome, 'teste'
  FROM testes_rapidos t
 WHERE t.ativo AND t.consumivel_id IS NULL
   AND NOT EXISTS (SELECT 1 FROM consumiveis c WHERE c.nome = t.nome);

UPDATE testes_rapidos t
   SET consumivel_id = c.id
  FROM consumiveis c
 WHERE c.nome = t.nome AND t.consumivel_id IS NULL AND t.ativo;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. RLS: acesso só pelo servidor (service role ignora RLS)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE consumiveis           ENABLE ROW LEVEL SECURITY;
ALTER TABLE consumivel_compras    ENABLE ROW LEVEL SECURITY;
ALTER TABLE consumivel_movimentos ENABLE ROW LEVEL SECURITY;

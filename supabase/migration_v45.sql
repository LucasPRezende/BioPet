-- Migration v45: Estoque de consumíveis vira o módulo ÚNICO de estoque
--
-- Generaliza a v44 para servir outras áreas além do teste rápido (Labs
-- Parceiros: tubos, caixas, gelo; no futuro, reagentes da Bioquímica):
--
--   consumiveis.categoria           → agrupa na tela ('teste_rapido', 'tubo', 'caixa', 'outro'...)
--   consumivel_movimentos.origem_*  → de onde veio a saída quando não é um laudo
--                                     (ex.: origem_tipo='pedido_lab', origem_id=<pedido>).
--                                     Sem FK de propósito: cada área usa o seu tipo.
--
-- consumir_estoque ganha p_origem_tipo / p_origem_id (opcionais). A assinatura
-- antiga é removida para não existirem duas versões da função.

ALTER TABLE consumiveis
  ADD COLUMN IF NOT EXISTS categoria TEXT NOT NULL DEFAULT 'outro';

UPDATE consumiveis c
   SET categoria = 'teste_rapido'
 WHERE categoria = 'outro'
   AND EXISTS (SELECT 1 FROM testes_rapidos t WHERE t.consumivel_id = c.id);

ALTER TABLE consumivel_movimentos
  ADD COLUMN IF NOT EXISTS origem_tipo TEXT,
  ADD COLUMN IF NOT EXISTS origem_id   INTEGER;

CREATE INDEX IF NOT EXISTS idx_consumivel_movimentos_origem
  ON consumivel_movimentos(origem_tipo, origem_id) WHERE origem_tipo IS NOT NULL;

DROP FUNCTION IF EXISTS consumir_estoque(INTEGER, INTEGER, TEXT, INTEGER, TEXT, INTEGER);

CREATE OR REPLACE FUNCTION consumir_estoque(
  p_consumivel_id INTEGER,
  p_quantidade    INTEGER,
  p_tipo          TEXT,
  p_laudo_id      INTEGER DEFAULT NULL,
  p_observacao    TEXT    DEFAULT NULL,
  p_user_id       INTEGER DEFAULT NULL,
  p_origem_tipo   TEXT    DEFAULT NULL,
  p_origem_id     INTEGER DEFAULT NULL
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
      (consumivel_id, compra_id, tipo, quantidade, custo_unitario, laudo_id, observacao, system_user_id, origem_tipo, origem_id)
    VALUES
      (p_consumivel_id, v_lote.id, p_tipo, v_tira, v_lote.custo_unitario, p_laudo_id, p_observacao, p_user_id, p_origem_tipo, p_origem_id);

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
      (consumivel_id, compra_id, tipo, quantidade, custo_unitario, laudo_id, observacao, system_user_id, origem_tipo, origem_id)
    VALUES
      (p_consumivel_id, NULL, p_tipo, v_restante, COALESCE(v_ultimo_custo, 0), p_laudo_id, p_observacao, p_user_id, p_origem_tipo, p_origem_id);

    v_custo := v_custo + v_restante * COALESCE(v_ultimo_custo, 0);
  END IF;

  RETURN ROUND(v_custo, 2);
END;
$$;

REVOKE EXECUTE ON FUNCTION consumir_estoque(INTEGER, INTEGER, TEXT, INTEGER, TEXT, INTEGER, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION consumir_estoque(INTEGER, INTEGER, TEXT, INTEGER, TEXT, INTEGER, TEXT, INTEGER) TO service_role;

-- registrar_compra_consumivel: a quitação parcial de uma saída pendente passa a
-- copiar também a origem (mesma assinatura, só o corpo muda)
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
        (consumivel_id, compra_id, tipo, quantidade, custo_unitario, laudo_id, observacao, system_user_id, criado_em, origem_tipo, origem_id)
      SELECT consumivel_id, NULL, tipo, quantidade - v_tira, custo_unitario, laudo_id, observacao, system_user_id, criado_em, origem_tipo, origem_id
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


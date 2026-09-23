-- Migration v46: Labs Parceiros passa a usar o estoque único de consumíveis
--
-- Pré-requisitos: v42 (caixa_preset), v44 e v45 (consumíveis).
--
-- 1. consumiveis.cor_tubo: liga um consumível de categoria 'tubo' à cor
--    normalizada dos itens do pedido (lab-tubos.ts normalizarCorTubo) — é por
--    ela que a coleta sabe qual tubo baixar.
-- 2. Conversão do estoque de insumos da Fase 5 (só existe onde a v42 ANTIGA
--    rodou, ou seja, no dev; no PRD este bloco não faz nada):
--      - cada insumo vira um consumível (tipo → categoria);
--      - o saldo vira um lote com o último custo do insumo;
--      - as saídas de pedidos viram saídas com origem 'pedido_lab', ligadas a
--        esse lote e com o custo da época (mantém o custo real dos pedidos);
--      - caixa_preset.kit_json troca insumo_id por consumivel_id;
--      - insumos e insumo_movimento são removidas.

ALTER TABLE consumiveis
  ADD COLUMN IF NOT EXISTS cor_tubo TEXT;

DO $$
DECLARE
  r         RECORD;
  v_id      INTEGER;
  v_compra  INTEGER;
  v_saldo   INTEGER;
  v_saidas  INTEGER;
  v_map     JSONB := '{}'::jsonb;
BEGIN
  IF to_regclass('public.insumos') IS NULL THEN
    RETURN;
  END IF;

  FOR r IN SELECT * FROM insumos ORDER BY id LOOP
    INSERT INTO consumiveis (nome, unidade, categoria, cor_tubo, estoque_minimo, ativo)
    VALUES (r.nome, r.unidade,
            CASE WHEN r.tipo IN ('tubo', 'caixa') THEN r.tipo ELSE 'outro' END,
            r.cor_tubo, CEIL(r.estoque_minimo)::INTEGER, r.ativo)
    RETURNING id INTO v_id;
    v_map := v_map || jsonb_build_object(r.id::TEXT, v_id);

    v_saldo  := GREATEST(FLOOR(r.estoque_atual), 0)::INTEGER;
    SELECT COALESCE(SUM(GREATEST(ROUND(m.quantidade), 1)), 0)::INTEGER INTO v_saidas
      FROM insumo_movimento m
     WHERE m.insumo_id = r.id AND m.tipo = 'saida' AND m.pedido_id IS NOT NULL;

    v_compra := NULL;
    IF v_saldo + v_saidas > 0 THEN
      -- Lote único: o que já saiu + o que resta, tudo ao último custo conhecido
      INSERT INTO consumivel_compras (consumivel_id, data_compra, quantidade, valor_total, saldo, observacao)
      VALUES (v_id, CURRENT_DATE, v_saldo + v_saidas, ROUND((v_saldo + v_saidas) * r.custo_unitario, 2), v_saldo,
              'Saldo migrado do estoque de insumos (Labs, Fase 5)')
      RETURNING id INTO v_compra;
    END IF;

    INSERT INTO consumivel_movimentos
      (consumivel_id, compra_id, tipo, quantidade, custo_unitario, observacao, origem_tipo, origem_id, criado_em)
    SELECT v_id, v_compra, 'consumo', GREATEST(ROUND(m.quantidade), 1)::INTEGER, r.custo_unitario,
           m.motivo, 'pedido_lab', m.pedido_id, m.criado_em
      FROM insumo_movimento m
     WHERE m.insumo_id = r.id AND m.tipo = 'saida' AND m.pedido_id IS NOT NULL;
  END LOOP;

  UPDATE caixa_preset cp
     SET kit_json = COALESCE((
       SELECT jsonb_agg(jsonb_build_object(
                'consumivel_id', (v_map ->> (k ->> 'insumo_id'))::INTEGER,
                'quantidade',    (k ->> 'quantidade')::NUMERIC))
         FROM jsonb_array_elements(cp.kit_json) k
        WHERE v_map ? (k ->> 'insumo_id')
     ), '[]'::jsonb)
   WHERE jsonb_typeof(cp.kit_json) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(cp.kit_json) k WHERE k ? 'insumo_id');

  DROP TABLE insumo_movimento;
  DROP TABLE insumos;
END $$;

-- Migration v50: catálogo de exames de PCR (Preços › PCR)
--
-- Pré-requisito: v49 (tela de Preços 2a + aplicar_alteracoes_precos).
--
-- Espelha testes_rapidos (migration v31/v35): cada PCR tem preço Pix/cartão e
-- comissão da clínica próprios, editáveis na tela de Preços com o mesmo fluxo
-- de pendências + histórico. `codigo` guarda o código do kit do fornecedor
-- (ex.: PC05-0), para casar com a nota fiscal / estoque.
--
-- Por enquanto é só o catálogo de preços: o PCR ainda não é agendável (não
-- entra em comissoes_exame nem tem tabela de vínculo com agendamentos).
--
-- 1. Tabela exames_pcr
-- 2. Seed com os exames da NF de kits (todos INATIVOS e com preço zerado —
--    preencher na tela e ligar "Ativo")
-- 3. aplicar_alteracoes_precos() passa a aceitar exames_pcr

BEGIN;

CREATE TABLE IF NOT EXISTS exames_pcr (
  id                SERIAL PRIMARY KEY,
  nome              TEXT          NOT NULL,
  codigo            TEXT,                             -- código do kit, ex.: "PC05-0"
  descricao         TEXT,                             -- subtítulo do laudo
  material_padrao   TEXT,
  metodo_padrao     TEXT,
  observacao_padrao TEXT,
  analitos          JSONB,                            -- painéis: um agente por item
  preco_pix         NUMERIC(10,2) NOT NULL DEFAULT 0,
  preco_cartao      NUMERIC(10,2) NOT NULL DEFAULT 0,
  comissao          NUMERIC(10,2) NOT NULL DEFAULT 0, -- comissão da clínica coletora
  ativo             BOOLEAN       NOT NULL DEFAULT FALSE,
  ordem             INTEGER       NOT NULL DEFAULT 0,
  criado_em         TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Acesso só pelo service role (server-side), igual às demais tabelas.
ALTER TABLE exames_pcr ENABLE ROW LEVEL SECURITY;

-- Seed: só roda se a tabela estiver vazia (migration idempotente).
INSERT INTO exames_pcr (nome, codigo, metodo_padrao, analitos, ordem)
SELECT v.nome, v.codigo, 'PCR', v.analitos::jsonb, v.ordem
FROM (VALUES
  ('Mycoplasma felis',                 'PF06-0',  NULL,                 1),
  ('FIV',                              'PF08-0',  NULL,                 2),
  ('Leucemia Felina (FeLV)',           'PF09-0',  NULL,                 3),
  ('FIV e FeLV',                       NULL,      '["FIV", "FeLV"]',    4),
  ('Cinomose',                         'PC05-0',  NULL,                 5),
  ('Babesia spp.',                     'PC07-0',  NULL,                 6),
  ('Ehrlichia spp.',                   'PC08-0',  NULL,                 7),
  ('Leishmania spp.',                  'PC12-0',  NULL,                 8),
  ('Anaplasma platys',                 NULL,      NULL,                 9),
  ('Leptospira spp.',                  'PFC05-0', NULL,                10),
  ('Doenças do Carrapato (4 agentes)', 'PC21-0',  NULL,                11),
  ('Painel Anemia Canina',             NULL,      NULL,                12)
) AS v(nome, codigo, analitos, ordem)
WHERE NOT EXISTS (SELECT 1 FROM exames_pcr);

CREATE OR REPLACE FUNCTION aplicar_alteracoes_precos(p_alteracoes jsonb, p_usuario integer)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_lote   uuid := gen_random_uuid();
  a        jsonb;
  v_tabela text;
  v_campo  text;
  v_id     integer;
  v_linha  jsonb;
BEGIN
  IF jsonb_typeof(p_alteracoes) <> 'array' OR jsonb_array_length(p_alteracoes) = 0 THEN
    RAISE EXCEPTION 'lote_vazio';
  END IF;

  FOR a IN SELECT * FROM jsonb_array_elements(p_alteracoes) LOOP
    v_tabela := a->>'tabela';
    v_campo  := a->>'campo';
    v_id     := (a->>'id')::integer;

    IF NOT (
         (v_tabela = 'comissoes_exame' AND v_campo IN (
            'preco_pix_comercial', 'preco_cartao_comercial', 'preco_pix_fora_horario',
            'preco_cartao_fora_horario', 'varia_por_horario', 'comissao_laudo',
            'comissao_clinica', 'comissao_extracao', 'custo_exame', 'ativo'))
      OR (v_tabela = 'bioquimica_exames' AND v_campo IN ('preco_pix', 'preco_cartao', 'custo', 'comissao', 'ativo'))
      OR (v_tabela = 'testes_rapidos'    AND v_campo IN ('preco_pix', 'preco_cartao', 'comissao', 'ativo'))
      OR (v_tabela = 'exames_pcr'        AND v_campo IN ('preco_pix', 'preco_cartao', 'comissao', 'ativo'))
    ) THEN
      RAISE EXCEPTION 'campo_invalido: %.%', v_tabela, v_campo;
    END IF;

    -- Valor atual, travando a linha até o fim da transação. Embrulhado num
    -- objeto para distinguir "linha não existe" de "campo NULL".
    EXECUTE format('SELECT jsonb_build_object(''v'', to_jsonb(%I)) FROM %I WHERE id = $1 FOR UPDATE', v_campo, v_tabela)
      INTO v_linha USING v_id;

    IF v_linha IS NULL THEN
      RAISE EXCEPTION 'nao_encontrado: %.%', v_tabela, v_id;
    END IF;

    IF (v_linha->'v') IS DISTINCT FROM (a->'antes') THEN
      RAISE EXCEPTION 'conflito: %.% %', v_tabela, v_id, v_campo;
    END IF;

    -- jsonb_populate_record converte o jsonb para o tipo da coluna.
    EXECUTE format(
      'UPDATE %1$I SET %2$I = (jsonb_populate_record(NULL::%1$I, $1)).%2$I WHERE id = $2',
      v_tabela, v_campo)
      USING jsonb_build_object(v_campo, a->'depois'), v_id;

    INSERT INTO historico_precos (tabela, registro_id, campo, valor_antes, valor_depois, alterado_por, lote_id)
    VALUES (v_tabela, v_id, v_campo, a->'antes', a->'depois', p_usuario, v_lote);
  END LOOP;

  RETURN v_lote;
END;
$$;

-- CREATE OR REPLACE mantém os grants, mas reafirma: só o service role executa.
REVOKE ALL ON FUNCTION aplicar_alteracoes_precos(jsonb, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION aplicar_alteracoes_precos(jsonb, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION aplicar_alteracoes_precos(jsonb, integer) TO service_role;

COMMIT;

-- Conferência:
-- SELECT id, codigo, nome, preco_pix, ativo FROM exames_pcr ORDER BY ordem;

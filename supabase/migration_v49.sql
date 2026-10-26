-- Migration v49: tela de Preços 2a (ativo, custo da bioquímica, histórico)
--
-- Pré-requisito: v48 (comissão por beneficiário).
--
-- 1. comissoes_exame.ativo: exame novo nasce inativo e só aparece no
--    agendamento/agente depois que alguém liga "Ativo" (e só liga com Pix
--    comercial > 0 — a regra fica na API). Os exames que já existem continuam
--    ativos (default true).
-- 2. bioquimica_exames.custo: custo por sub-exame, para mostrar o lucro.
--    Fica NULL até alguém definir ("definir" na tela). Teste Rápido não ganha
--    custo: virá do estoque.
-- 3. historico_precos: quem mudou o quê e quando na tabela de preços. Uma
--    confirmação da tela ("Revisar e salvar") vira um lote_id.
-- 4. aplicar_alteracoes_precos(): aplica um lote de alterações numa transação
--    só. Confere que o valor "antes" ainda é o que está no banco (senão aborta
--    tudo com 'conflito'), aplica e grava o histórico. Só aceita os campos
--    editáveis da tela (lista fixa abaixo).

BEGIN;

ALTER TABLE comissoes_exame
  ADD COLUMN IF NOT EXISTS ativo boolean NOT NULL DEFAULT true;

ALTER TABLE bioquimica_exames
  ADD COLUMN IF NOT EXISTS custo numeric(10,2);

CREATE TABLE IF NOT EXISTS historico_precos (
  id           bigserial PRIMARY KEY,
  tabela       text        NOT NULL,
  registro_id  integer     NOT NULL,
  campo        text        NOT NULL,
  valor_antes  jsonb,
  valor_depois jsonb,
  alterado_por integer     REFERENCES system_users(id),
  alterado_em  timestamptz NOT NULL DEFAULT now(),
  lote_id      uuid        NOT NULL
);

CREATE INDEX IF NOT EXISTS historico_precos_registro_idx ON historico_precos (tabela, registro_id);
CREATE INDEX IF NOT EXISTS historico_precos_lote_idx     ON historico_precos (lote_id);

-- Acesso só pelo service role (server-side), igual às demais tabelas.
ALTER TABLE historico_precos ENABLE ROW LEVEL SECURITY;

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

-- Função em public é exposta pelo PostgREST: só o service role executa.
REVOKE ALL ON FUNCTION aplicar_alteracoes_precos(jsonb, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION aplicar_alteracoes_precos(jsonb, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION aplicar_alteracoes_precos(jsonb, integer) TO service_role;

COMMIT;

-- Conferência:
-- SELECT tipo_exame, ativo FROM comissoes_exame ORDER BY tipo_exame;
-- SELECT nome, custo FROM bioquimica_exames ORDER BY ordem;
-- SELECT * FROM historico_precos ORDER BY id DESC LIMIT 20;

-- Migration v24: bloqueio total de deleção nas tabelas críticas
--
-- agendamentos, laudos, tutores, pets: NUNCA devem ser deletados pelo app.
-- Qualquer DELETE nessas tabelas é sintoma de bug ou acesso indevido.
-- A transação é abortada automaticamente.
--
-- APLICAR SOMENTE NO BANCO DE PRODUÇÃO (ykhshkgdikjplnedtxye).
-- O banco de dev não tem essa proteção — deleções continuam livres lá.
--
-- Para deletar legitimamente em produção (ex: DBA corrigindo dado):
--   BEGIN;
--   SET LOCAL app.allow_delete = 'true';
--   DELETE FROM <tabela> WHERE ...;
--   COMMIT;
--
-- NÃO protege: agendamento_exames (inferível pelos agendamentos)
-- NÃO protege: clinica_exames_permitidos (app deleta todos ao reconfigurar)

CREATE OR REPLACE FUNCTION public.prevent_delete()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF current_setting('app.allow_delete', true) IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION
      '[BioPet] Deleção bloqueada na tabela "%". '
      'Esta tabela é protegida contra exclusão. '
      'Para deletar como DBA: SET LOCAL app.allow_delete = ''true'' dentro de uma transação explícita.',
      TG_TABLE_NAME;
  END IF;

  RETURN NULL;
END;
$$;

-- Remove triggers antigos se existirem (idempotente)
DROP TRIGGER IF EXISTS trg_bulk_delete_agendamentos ON agendamentos;
DROP TRIGGER IF EXISTS trg_bulk_delete_laudos       ON laudos;
DROP TRIGGER IF EXISTS trg_bulk_delete_tutores      ON tutores;
DROP TRIGGER IF EXISTS trg_bulk_delete_pets         ON pets;
DROP FUNCTION IF EXISTS public.prevent_bulk_delete();

CREATE TRIGGER trg_no_delete_agendamentos
AFTER DELETE ON agendamentos
REFERENCING OLD TABLE AS old_table
FOR EACH STATEMENT EXECUTE FUNCTION public.prevent_delete();

CREATE TRIGGER trg_no_delete_laudos
AFTER DELETE ON laudos
REFERENCING OLD TABLE AS old_table
FOR EACH STATEMENT EXECUTE FUNCTION public.prevent_delete();

CREATE TRIGGER trg_no_delete_tutores
AFTER DELETE ON tutores
REFERENCING OLD TABLE AS old_table
FOR EACH STATEMENT EXECUTE FUNCTION public.prevent_delete();

CREATE TRIGGER trg_no_delete_pets
AFTER DELETE ON pets
REFERENCING OLD TABLE AS old_table
FOR EACH STATEMENT EXECUTE FUNCTION public.prevent_delete();

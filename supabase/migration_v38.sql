-- Migration v38: permite selecionar mais de um exame igual no mesmo agendamento
--
-- Hoje só o Raio-X tem esse comportamento, resolvido via um exame separado
-- ("Raio-X Acréscimo por Estudo Adicional") com preço reduzido. Esta migration
-- generaliza a possibilidade para qualquer exame: um novo flag booleano no
-- catálogo (comissoes_exame) que o admin liga por exame em /admin/comissoes.
-- Quando ligado, o AgendamentoForm permite repetir o mesmo tipo_exame N vezes
-- (preço cheio por unidade, sem desconto tipo "acréscimo"). Cada unidade vira
-- uma linha própria em agendamento_exames — mesmo padrão que já existe hoje
-- para o Raio-X (múltiplas linhas com o mesmo tipo_exame), então nenhuma
-- mudança de schema é necessária em agendamento_exames.

ALTER TABLE comissoes_exame
  ADD COLUMN IF NOT EXISTS permite_multiplo BOOLEAN NOT NULL DEFAULT FALSE;

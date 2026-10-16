-- Migration v48: comissão por beneficiário
--
-- Até aqui cada exame tinha um único `valor_comissao`, e quem recebia estava
-- fixo no código: Bioquímica/Teste Rápido → clínica, Hemogasometria → vet da
-- extração, o resto → quem fez o laudo. Com o Hemograma (comissão da clínica)
-- isso virou uma colcha de exceções.
--
-- Agora a tabela de Preços diz o valor para cada beneficiário, e um exame pode
-- pagar mais de um ao mesmo tempo:
--
--   comissao_laudo     → system_user que gerou o laudo (vira laudos.valor_comissao)
--   comissao_clinica   → clínica parceira (comissao_clinica_id / abate do repasse)
--   comissao_extracao  → vet que extraiu o sangue (agendamentos.comissao_extracao)
--
-- Bioquímica e Teste Rápido continuam com a comissão da clínica POR SUB-EXAME
-- (bioquimica_exames.comissao / testes_rapidos.comissao); as três colunas
-- ficam 0 na linha "agrupadora" deles.
--
-- Para os demais exames, a comissão da clínica fica gravada na linha do
-- agendamento (agendamento_exames.comissao_clinica) no momento em que é
-- marcado — mudar a tabela depois não mexe no que já foi agendado, igual aos
-- sub-exames.
--
-- `comissoes_exame.valor_comissao` deixa de ser lido pelo código. Fica na
-- tabela por enquanto (rollback); pode ser removida numa migration futura.

BEGIN;

ALTER TABLE comissoes_exame
  ADD COLUMN IF NOT EXISTS comissao_laudo    numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS comissao_clinica  numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS comissao_extracao numeric(10,2) NOT NULL DEFAULT 0;

-- Distribui o valor_comissao atual seguindo a regra que estava no código.
UPDATE comissoes_exame
   SET comissao_clinica = COALESCE(valor_comissao, 0)
 WHERE tipo_exame = 'Hemograma';

UPDATE comissoes_exame
   SET comissao_extracao = COALESCE(valor_comissao, 0)
 WHERE tipo_exame = 'Hemogasometria';

UPDATE comissoes_exame
   SET comissao_laudo = COALESCE(valor_comissao, 0)
 WHERE tipo_exame NOT IN ('Hemograma', 'Hemogasometria', 'Bioquímica', 'Teste Rápido');

ALTER TABLE agendamento_exames
  ADD COLUMN IF NOT EXISTS comissao_clinica numeric(10,2) NOT NULL DEFAULT 0;

-- Hemogramas já agendados (não cancelados) recebem a comissão atual da tabela.
-- Só aparece como devida no relatório se o agendamento tiver clínica
-- (comissao_clinica_id); sem clínica, o valor fica lá e não é devido a ninguém.
UPDATE agendamento_exames ae
   SET comissao_clinica = ce.comissao_clinica
  FROM comissoes_exame ce, agendamentos a
 WHERE ce.tipo_exame = ae.tipo_exame
   AND a.id = ae.agendamento_id
   AND a.status <> 'cancelado'
   AND COALESCE(a.forma_pagamento, '') <> 'gratuito'
   AND ce.comissao_clinica > 0
   AND ae.comissao_clinica = 0;

COMMIT;

-- Conferência:
-- SELECT tipo_exame, valor_comissao, comissao_laudo, comissao_clinica, comissao_extracao
--   FROM comissoes_exame ORDER BY tipo_exame;
-- SELECT tipo_exame, count(*), sum(comissao_clinica)
--   FROM agendamento_exames WHERE comissao_clinica > 0 GROUP BY 1;

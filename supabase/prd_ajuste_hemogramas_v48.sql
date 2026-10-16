-- PRD, depois da migration_v48: recalcula 4 Hemogramas da Clive agendados com
-- a CLÍNICA pagando antes da regra nova (valor cheio R$ 50). Pela regra nova
-- o repasse é preço − comissão da clínica = 50 − 30 = R$ 20.
-- Decisão do Lucas em 16/10/2026. Só mexe nas linhas de Hemograma desses
-- agendamentos, e só se ainda estiverem como estavam na conferência.
--
-- Agendamentos: 769, 770, 771, 773 (status_pagamento a_receber, repasse não confirmado)
-- Linhas de Hemograma: 778, 780, 781, 783 (valor 50)

BEGIN;

UPDATE agendamento_exames
   SET valor = 20
 WHERE id IN (778, 780, 781, 783)
   AND tipo_exame = 'Hemograma'
   AND valor = 50;
-- esperado: UPDATE 4

UPDATE agendamentos a
   SET valor = (SELECT sum(ae.valor) FROM agendamento_exames ae WHERE ae.agendamento_id = a.id)
 WHERE a.id IN (769, 770, 771, 773)
   AND a.status_pagamento = 'a_receber'
   AND a.repasse_confirmado = false;
-- esperado: UPDATE 4

-- Conferência antes do COMMIT (os 4 devem estar com valor 20):
SELECT id, valor, status_pagamento FROM agendamentos WHERE id IN (769, 770, 771, 773) ORDER BY id;

COMMIT;

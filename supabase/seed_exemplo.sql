-- Tutor de exemplo
INSERT INTO tutores (telefone, nome)
VALUES ('5524999990001', 'Maria Souza')
ON CONFLICT (telefone) DO NOTHING;

-- Pet de exemplo
INSERT INTO pets (tutor_id, nome, especie, raca)
SELECT id, 'Thor', 'Cachorro', 'Golden Retriever'
FROM tutores WHERE telefone = '5524999990001'
ON CONFLICT DO NOTHING;

-- Agendamento hoje às 10:30 — status agendado
INSERT INTO agendamentos (tutor_id, pet_id, tipo_exame, data_hora, duracao_minutos, valor, forma_pagamento, status, observacoes)
SELECT
  t.id,
  p.id,
  'Ultrassom Abdominal',
  (CURRENT_DATE + INTERVAL '10 hours 30 minutes') AT TIME ZONE 'America/Sao_Paulo' AT TIME ZONE 'UTC',
  30,
  280.00,
  'pix',
  'agendado',
  'Animal em jejum de 6h'
FROM tutores t
JOIN pets p ON p.tutor_id = t.id
WHERE t.telefone = '5524999990001';

-- Agendamento hoje às 14:00 — status em atendimento
INSERT INTO agendamentos (tutor_id, pet_id, tipo_exame, data_hora, duracao_minutos, valor, forma_pagamento, status)
SELECT
  t.id,
  p.id,
  'Raio-X',
  (CURRENT_DATE + INTERVAL '14 hours') AT TIME ZONE 'America/Sao_Paulo' AT TIME ZONE 'UTC',
  20,
  150.00,
  'cartão',
  'em atendimento'
FROM tutores t
JOIN pets p ON p.tutor_id = t.id
WHERE t.telefone = '5524999990001';

-- Agendamento hoje às 16:00 — status concluído
INSERT INTO agendamentos (tutor_id, pet_id, tipo_exame, data_hora, duracao_minutos, valor, forma_pagamento, status)
SELECT
  t.id,
  p.id,
  'Elastografia',
  (CURRENT_DATE + INTERVAL '16 hours') AT TIME ZONE 'America/Sao_Paulo' AT TIME ZONE 'UTC',
  45,
  350.00,
  'dinheiro',
  'concluído'
FROM tutores t
JOIN pets p ON p.tutor_id = t.id
WHERE t.telefone = '5524999990001';

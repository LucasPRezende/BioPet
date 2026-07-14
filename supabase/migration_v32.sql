-- Migration v32: pausa da IA por telefone (independente de existir tutor)
--
-- Até aqui, "atendimento humano assumiu a conversa" só pausava a IA gravando
-- em `tutores.atendimento_humano` — então números que mandam mensagem pro
-- WhatsApp da clínica mas NÃO são tutor cadastrado (ex.: parceiro/fornecedor,
-- número errado) nunca ficavam pausados de verdade: o UPDATE em `tutores`
-- não encontrava linha nenhuma e o bot continuava respondendo depois do
-- transferir_humano. `conversas` já existe por telefone para QUALQUER
-- contato que troca mensagem com o bot, então a pausa passa a viver lá também.

ALTER TABLE conversas
  ADD COLUMN IF NOT EXISTS atendimento_humano_ate TIMESTAMPTZ;

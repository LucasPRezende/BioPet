-- migration_v15: entrega_pagamento e encaixe em agendamentos
ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS entrega_pagamento TEXT DEFAULT 'link';
ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS encaixe BOOLEAN NOT NULL DEFAULT FALSE;

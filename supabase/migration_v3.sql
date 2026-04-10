-- BioPet — Migration v3: flag recebe_comissao em system_users
ALTER TABLE system_users ADD COLUMN IF NOT EXISTS recebe_comissao BOOLEAN NOT NULL DEFAULT TRUE;

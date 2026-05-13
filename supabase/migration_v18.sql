-- Migration v18: Configuração global do sistema (chave-valor)
-- Usado para armazenar chaves de API de IA configuradas pelo admin

CREATE TABLE IF NOT EXISTS system_config (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Exemplos de chaves:
-- ai_model          -> 'gemini' | 'anthropic'
-- ai_gemini_key     -> 'AIza...'
-- ai_gemini_system  -> system prompt
-- ai_claude_key     -> 'sk-ant-...'
-- ai_claude_endpoint-> 'https://...'
-- ai_claude_system  -> system prompt

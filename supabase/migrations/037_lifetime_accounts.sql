-- Migration para adicionar campos de controle Lifetime e acesso à IA
ALTER TABLE accounts 
  ADD COLUMN IF NOT EXISTS is_lifetime BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS lifetime_has_ai BOOLEAN NOT NULL DEFAULT true;

-- Criar índice para melhorar pesquisas de faturamento contendo is_lifetime
CREATE INDEX IF NOT EXISTS idx_accounts_lifetime ON accounts(is_lifetime, lifetime_has_ai);

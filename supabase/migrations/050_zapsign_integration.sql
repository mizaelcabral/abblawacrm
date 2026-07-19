-- 1. Tabela de configuração ZapSign do Tenant
CREATE TABLE IF NOT EXISTS zapsign_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE UNIQUE,
    api_key TEXT, -- Armazenado criptografado usando encryption.ts
    environment TEXT NOT NULL DEFAULT 'production' CHECK (environment IN ('sandbox', 'production')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Habilitar RLS para zapsign_config
ALTER TABLE zapsign_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenants can manage their own zapsign_config" 
    ON zapsign_config FOR ALL 
    USING (account_id = auth.uid() OR account_id IN (SELECT account_id FROM profiles WHERE user_id = auth.uid()));

-- 2. Tabela de documentos ZapSign enviados
CREATE TABLE IF NOT EXISTS zapsign_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
    conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
    
    doc_token TEXT NOT NULL UNIQUE,
    doc_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'signed', 'refused', 'expired', 'cancelled')),
    
    signer_name TEXT,
    signer_email TEXT,
    signer_phone TEXT,
    sign_url TEXT,
    signed_at TIMESTAMP WITH TIME ZONE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Habilitar RLS para zapsign_documents
ALTER TABLE zapsign_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenants can manage their own zapsign_documents" 
    ON zapsign_documents FOR ALL 
    USING (account_id IN (SELECT account_id FROM profiles WHERE user_id = auth.uid()));

-- Index para buscas rápidas
CREATE INDEX IF NOT EXISTS idx_zapsign_docs_account ON zapsign_documents(account_id);
CREATE INDEX IF NOT EXISTS idx_zapsign_docs_contact ON zapsign_documents(contact_id);
CREATE INDEX IF NOT EXISTS idx_zapsign_docs_status ON zapsign_documents(status);

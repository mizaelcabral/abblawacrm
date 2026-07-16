-- ============================================================
-- AI INTEGRATION
-- ============================================================

-- 1. Enable the pgvector extension for semantic searches
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Add AI configuration fields to the conversations table
ALTER TABLE conversations 
  ADD COLUMN IF NOT EXISTS ai_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ai_system_prompt TEXT;

-- 3. Create the knowledge_base table to store company documents and FAQs
CREATE TABLE IF NOT EXISTS knowledge_base (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  embedding vector(1536), -- Vector dimensions for Gemini / OpenAI embedding
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast cosine similarity search
CREATE INDEX IF NOT EXISTS idx_kb_embedding ON knowledge_base USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Enable Row Level Security (RLS)
ALTER TABLE knowledge_base ENABLE ROW LEVEL SECURITY;

-- Define security policies (only members of the account can access)
DROP POLICY IF EXISTS "Users can manage knowledge base for their account" ON knowledge_base;
CREATE POLICY "Users can manage knowledge base for their account" 
  ON knowledge_base FOR ALL 
  USING (account_id = (SELECT account_id FROM profiles WHERE profiles.user_id = auth.uid()));

-- 4. SQL function to perform vector similarity search
CREATE OR REPLACE FUNCTION match_knowledge_base (
  query_embedding vector(1536),
  match_threshold FLOAT,
  match_count INT,
  p_account_id UUID
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  content TEXT,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    kb.id,
    kb.title,
    kb.content,
    1 - (kb.embedding <=> query_embedding) AS similarity
  FROM knowledge_base kb
  WHERE kb.account_id = p_account_id
    AND 1 - (kb.embedding <=> query_embedding) > match_threshold
  ORDER BY kb.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

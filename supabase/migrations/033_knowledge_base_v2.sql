-- ============================================================
-- KNOWLEDGE BASE V2
-- Fix vector dimensions (Gemini text-embedding-004 = 768 dims)
-- Add category, tags, is_active, source, view_count columns
-- ============================================================

-- 1. Drop the old ivfflat index (can't change dimensions without rebuilding)
DROP INDEX IF EXISTS idx_kb_embedding;

-- 2. Alter embedding column to correct 768 dimensions
ALTER TABLE knowledge_base
  ALTER COLUMN embedding TYPE vector(768)
  USING embedding::text::vector(768);

-- 3. Add new organizational columns
ALTER TABLE knowledge_base
  ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'FAQ',
  ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS source_url TEXT,
  ADD COLUMN IF NOT EXISTS view_count INTEGER NOT NULL DEFAULT 0;

-- 4. Recreate the ivfflat index with correct dimensions
CREATE INDEX IF NOT EXISTS idx_kb_embedding
  ON knowledge_base USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- 5. Full-text search index for Portuguese
CREATE INDEX IF NOT EXISTS idx_kb_fts
  ON knowledge_base USING gin(to_tsvector('portuguese', title || ' ' || content));

-- 6. Update the match function to use 768 dims and include category/active filter
CREATE OR REPLACE FUNCTION match_knowledge_base (
  query_embedding vector(768),
  match_threshold FLOAT,
  match_count INT,
  p_account_id UUID
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  content TEXT,
  category TEXT,
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
    kb.category,
    1 - (kb.embedding <=> query_embedding) AS similarity
  FROM knowledge_base kb
  WHERE kb.account_id = p_account_id
    AND kb.is_active = TRUE
    AND kb.embedding IS NOT NULL
    AND 1 - (kb.embedding <=> query_embedding) > match_threshold
  ORDER BY kb.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

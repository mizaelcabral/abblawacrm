-- ============================================================
-- 058_add_notes_to_documents.sql
-- Adiciona a coluna notes na tabela documents para suporte a observações
-- ============================================================

ALTER TABLE public.documents 
  ADD COLUMN IF NOT EXISTS notes TEXT;

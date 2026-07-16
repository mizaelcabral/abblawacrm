-- Cria o bucket de armazenamento `profiles` no Supabase
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'profiles',
  'profiles',
  TRUE,
  2097152, -- Limite de 2 MB
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Políticas de RLS para o bucket `profiles`
DROP POLICY IF EXISTS "Profiles are publicly readable" ON storage.objects;
CREATE POLICY "Profiles are publicly readable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'profiles');

DROP POLICY IF EXISTS "Members can upload profiles media" ON storage.objects;
CREATE POLICY "Members can upload profiles media"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'profiles'
    AND (
      EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.user_id = auth.uid()
        AND p.account_id::text = (storage.foldername(name))[2]
      )
    )
  );

DROP POLICY IF EXISTS "Members can update profiles media" ON storage.objects;
CREATE POLICY "Members can update profiles media"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'profiles'
    AND (
      EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.user_id = auth.uid()
        AND p.account_id::text = (storage.foldername(name))[2]
      )
    )
  );

DROP POLICY IF EXISTS "Members can delete profiles media" ON storage.objects;
CREATE POLICY "Members can delete profiles media"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'profiles'
    AND (
      EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.user_id = auth.uid()
        AND p.account_id::text = (storage.foldername(name))[2]
      )
    )
  );

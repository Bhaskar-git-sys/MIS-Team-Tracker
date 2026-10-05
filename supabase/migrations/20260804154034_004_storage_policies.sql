/*
# Storage policies for avatars, chat-files, uploads buckets
*/

-- Avatars: public read, authenticated write
DROP POLICY IF EXISTS "avatars_public_read" ON storage.objects;
CREATE POLICY "avatars_public_read" ON storage.objects
  FOR SELECT TO public USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "avatars_auth_upload" ON storage.objects;
CREATE POLICY "avatars_auth_upload" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'avatars');

DROP POLICY IF EXISTS "avatars_auth_update" ON storage.objects;
CREATE POLICY "avatars_auth_update" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'avatars') WITH CHECK (bucket_id = 'avatars');

DROP POLICY IF EXISTS "avatars_owner_delete" ON storage.objects;
CREATE POLICY "avatars_owner_delete" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'avatars' AND owner = auth.uid());

-- Chat files: authenticated read and write
DROP POLICY IF EXISTS "chat_files_read" ON storage.objects;
CREATE POLICY "chat_files_read" ON storage.objects
  FOR SELECT TO public USING (bucket_id = 'chat-files');

DROP POLICY IF EXISTS "chat_files_upload" ON storage.objects;
CREATE POLICY "chat_files_upload" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'chat-files');

DROP POLICY IF EXISTS "chat_files_owner_delete" ON storage.objects;
CREATE POLICY "chat_files_owner_delete" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'chat-files' AND owner = auth.uid());

-- Uploads: authenticated read and write
DROP POLICY IF EXISTS "uploads_read" ON storage.objects;
CREATE POLICY "uploads_read" ON storage.objects
  FOR SELECT TO public USING (bucket_id = 'uploads');

DROP POLICY IF EXISTS "uploads_upload" ON storage.objects;
CREATE POLICY "uploads_upload" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'uploads');

DROP POLICY IF EXISTS "uploads_owner_delete" ON storage.objects;
CREATE POLICY "uploads_owner_delete" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'uploads' AND owner = auth.uid());

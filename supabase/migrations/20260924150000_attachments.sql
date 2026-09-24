-- Generic file attachments: memory/journal images, course/class documents,
-- and (later) chat file context all share one table + one private bucket,
-- keyed by (entity_type, entity_id) so any existing row can have files
-- attached without a schema change per feature.

CREATE TABLE IF NOT EXISTS attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  file_name text NOT NULL,
  file_type text NOT NULL,
  storage_path text NOT NULL,
  file_size bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select own attachments" ON attachments;
CREATE POLICY "select own attachments" ON attachments
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "insert own attachments" ON attachments;
CREATE POLICY "insert own attachments" ON attachments
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "delete own attachments" ON attachments;
CREATE POLICY "delete own attachments" ON attachments
  FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS attachments_entity_idx ON attachments(entity_type, entity_id);

-- Storage bucket, mirroring the world-assets pattern: private, folder-scoped
-- by user id (storage path is always "<user_id>/...").
INSERT INTO storage.buckets (id, name, public)
VALUES ('attachments', 'attachments', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Users can upload attachments" ON storage.objects;
CREATE POLICY "Users can upload attachments" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'attachments'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users can read own attachments" ON storage.objects;
CREATE POLICY "Users can read own attachments" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'attachments'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users can delete own attachments" ON storage.objects;
CREATE POLICY "Users can delete own attachments" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'attachments'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Push + email reminders, and post-class audio transcripts.

-- ---------------------------------------------------------------- reminders
-- One row per browser/device the student turned push on for.
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, endpoint)
);
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_push_subscriptions" ON push_subscriptions;
CREATE POLICY "select_own_push_subscriptions" ON push_subscriptions FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_push_subscriptions" ON push_subscriptions;
CREATE POLICY "insert_own_push_subscriptions" ON push_subscriptions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_push_subscriptions" ON push_subscriptions;
CREATE POLICY "update_own_push_subscriptions" ON push_subscriptions FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_push_subscriptions" ON push_subscriptions;
CREATE POLICY "delete_own_push_subscriptions" ON push_subscriptions FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Email is opt-in (push already requires an explicit browser permission).
ALTER TABLE settings ADD COLUMN IF NOT EXISTS email_reminders_enabled boolean NOT NULL DEFAULT false;

-- What has already been sent, so a reminder goes out once per day per channel even if the job re-runs.
-- Written only by the send-reminders function (service role); students can read their own history.
CREATE TABLE IF NOT EXISTS notification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  ref_key text NOT NULL,
  channel text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, kind, ref_key, channel)
);
ALTER TABLE notification_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_notification_log" ON notification_log;
CREATE POLICY "select_own_notification_log" ON notification_log FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- ---------------------------------------------------------------- audio
-- Transcripts live on the attachment they came from.
ALTER TABLE attachments ADD COLUMN IF NOT EXISTS transcript text;
ALTER TABLE attachments ADD COLUMN IF NOT EXISTS transcribed_at timestamptz;

-- Needed so the transcribe-audio function (running as the student) can save the transcript.
DROP POLICY IF EXISTS "update own attachments" ON attachments;
CREATE POLICY "update own attachments" ON attachments
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

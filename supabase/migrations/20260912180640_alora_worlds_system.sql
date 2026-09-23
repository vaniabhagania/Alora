/*
# ALORA Phase 2: Your Worlds System

This migration creates the complete database layer for the "Your Worlds" feature,
which replaces the old preset Monthly Theme system with a fully custom
moodboard-based visual world builder.

## New Tables

1. `worlds` — Top-level world records. Each world belongs to one user and has a
   name, optional description, position for ordering, active flag (only one
   world active per user), and a theme_settings JSONB column storing the full
   appearance configuration (colors, typography, component styles, etc.).

2. `world_elements` — Individual elements placed on a world's moodboard canvas.
   Each element has a type (image, text, quote, color, shape, sticker, music,
   memory, journal, date), position (x, y), size (width, height), rotation,
   z-index, opacity, and a JSONB `props` column for type-specific properties.
   Elements belong to a world (which belongs to a user).

3. `world_music` — Music objects associated with a world. Stores song title,
   artist, album art URL, and player visibility setting. Designed to support
   future Spotify integration without schema changes.

## Storage

A private Supabase Storage bucket `world-assets` is created for user-uploaded
images. Storage policies ensure users can only access their own assets.

## Security

- RLS enabled on all tables.
- All tables use `DEFAULT auth.uid()` on user_id so client inserts omitting
  user_id still pass the WITH CHECK policy.
- world_elements policies check ownership through the parent worlds table
  using EXISTS subqueries.
- Storage policies scope file access by user ID in the file path.

## Important Notes

- The old `themes` table (from Phase 1) is NOT dropped or modified — it
  remains for backward compatibility but is no longer used by the UI.
- The `alora_profiles` table is not modified.
- All new tables use CASCADE on delete from worlds, so deleting a world
  automatically cleans up its elements and music.
*/

-- ============================================================
-- 1. WORLDS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS worlds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  position int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT false,
  theme_settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_worlds_user ON worlds(user_id);
CREATE INDEX IF NOT EXISTS idx_worlds_active ON worlds(user_id, is_active);

ALTER TABLE worlds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_worlds" ON worlds;
CREATE POLICY "select_own_worlds" ON worlds FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_worlds" ON worlds;
CREATE POLICY "insert_own_worlds" ON worlds FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_worlds" ON worlds;
CREATE POLICY "update_own_worlds" ON worlds FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_worlds" ON worlds;
CREATE POLICY "delete_own_worlds" ON worlds FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ============================================================
-- 2. WORLD_ELEMENTS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS world_elements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id uuid NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  element_type text NOT NULL DEFAULT 'text',
  pos_x double precision NOT NULL DEFAULT 0,
  pos_y double precision NOT NULL DEFAULT 0,
  width double precision NOT NULL DEFAULT 200,
  height double precision NOT NULL DEFAULT 100,
  rotation double precision NOT NULL DEFAULT 0,
  z_index int NOT NULL DEFAULT 0,
  opacity double precision NOT NULL DEFAULT 1.0,
  props jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_world_elements_world ON world_elements(world_id);

ALTER TABLE world_elements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_world_elements" ON world_elements;
CREATE POLICY "select_own_world_elements" ON world_elements FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM worlds WHERE worlds.id = world_elements.world_id AND worlds.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_own_world_elements" ON world_elements;
CREATE POLICY "insert_own_world_elements" ON world_elements FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM worlds WHERE worlds.id = world_elements.world_id AND worlds.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "update_own_world_elements" ON world_elements;
CREATE POLICY "update_own_world_elements" ON world_elements FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM worlds WHERE worlds.id = world_elements.world_id AND worlds.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM worlds WHERE worlds.id = world_elements.world_id AND worlds.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "delete_own_world_elements" ON world_elements;
CREATE POLICY "delete_own_world_elements" ON world_elements FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM worlds WHERE worlds.id = world_elements.world_id AND worlds.user_id = auth.uid())
  );

-- ============================================================
-- 3. WORLD_MUSIC TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS world_music (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id uuid NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  song_title text,
  artist text,
  album_art_url text,
  player_visibility text NOT NULL DEFAULT 'minimal',
  is_playing boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_world_music_world ON world_music(world_id);

ALTER TABLE world_music ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_world_music" ON world_music;
CREATE POLICY "select_own_world_music" ON world_music FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM worlds WHERE worlds.id = world_music.world_id AND worlds.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_own_world_music" ON world_music;
CREATE POLICY "insert_own_world_music" ON world_music FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM worlds WHERE worlds.id = world_music.world_id AND worlds.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "update_own_world_music" ON world_music;
CREATE POLICY "update_own_world_music" ON world_music FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM worlds WHERE worlds.id = world_music.world_id AND worlds.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM worlds WHERE worlds.id = world_music.world_id AND worlds.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "delete_own_world_music" ON world_music;
CREATE POLICY "delete_own_world_music" ON world_music FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM worlds WHERE worlds.id = world_music.world_id AND worlds.user_id = auth.uid())
  );

-- ============================================================
-- 4. STORAGE BUCKET FOR WORLD ASSETS
-- ============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('world-assets', 'world-assets', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: users can only access their own folder
DROP POLICY IF EXISTS "Users can upload world assets" ON storage.objects;
CREATE POLICY "Users can upload world assets" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'world-assets'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users can read own world assets" ON storage.objects;
CREATE POLICY "Users can read own world assets" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'world-assets'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users can update own world assets" ON storage.objects;
CREATE POLICY "Users can update own world assets" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'world-assets'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users can delete own world assets" ON storage.objects;
CREATE POLICY "Users can delete own world assets" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'world-assets'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
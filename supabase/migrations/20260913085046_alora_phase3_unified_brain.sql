/*
# ALORA Phase 3: The Unified Brain

## Overview
This migration adds the database infrastructure for ALORA's unified brain system.
It introduces activity events, insight records, chat persistence, and extends
the existing memories table with metadata for distinguishing explicit memories
from inferred patterns and system facts.

## New Tables

### 1. `activity_events`
Tracks meaningful user actions across all ALORA features for behavioral modeling.
- `id` (uuid PK)
- `user_id` (uuid, DEFAULT auth.uid(), FK to auth.users)
- `event_type` (text) — e.g. task_completed, quiz_completed, mistake_recorded
- `entity_type` (text) — e.g. task, quiz, topic, journal, goal, world
- `entity_id` (uuid, nullable) — ID of the related entity
- `metadata` (jsonb, default {}) — additional context about the event
- `created_at` (timestamptz, default now())

### 2. `insights`
Stores AI-generated insights about the user based on unified data analysis.
- `id` (uuid PK)
- `user_id` (uuid, DEFAULT auth.uid(), FK to auth.users)
- `insight_type` (text) — e.g. study_pattern, task_behavior, progress, contradiction
- `title` (text) — short headline
- `description` (text) — full insight text
- `evidence` (jsonb, default []) — array of evidence references
- `severity` (text, default 'info') — info, warning, positive
- `is_dismissed` (boolean, default false) — user can dismiss insights
- `created_at` (timestamptz, default now())

### 3. `chat_conversations`
Persists Alora Chat conversations so context survives navigation/refresh.
- `id` (uuid PK)
- `user_id` (uuid, DEFAULT auth.uid(), FK to auth.users)
- `title` (text, default 'New Conversation')
- `created_at`, `updated_at` (timestamptz)

### 4. `chat_messages`
Individual messages within a chat conversation.
- `id` (uuid PK)
- `conversation_id` (uuid, FK to chat_conversations CASCADE)
- `user_id` (uuid, DEFAULT auth.uid(), FK to auth.users)
- `role` (text) — 'user' or 'assistant'
- `content` (text)
- `metadata` (jsonb, default {}) — context snapshot, sources used, etc.
- `created_at` (timestamptz, default now())

## Modified Tables

### `memories` (extended)
Added columns to support the three-layer memory architecture:
- `memory_type` (text, default 'explicit') — explicit | inferred | system_fact
- `confidence` (numeric, default 1.0) — 0.0 to 1.0, how confident ALORA is
- `status` (text, default 'active') — active | dismissed | incorrect
- `last_accessed` (timestamptz, nullable) — when memory was last retrieved
- `last_reinforced` (timestamptz, nullable) — when memory was last confirmed
- `recurrence_count` (int, default 0) — how many times this pattern has been observed
- `evidence` (jsonb, default []) — supporting data for inferred memories

## Security
- RLS enabled on all new tables
- All tables use owner-scoped policies (auth.uid() = user_id)
- chat_messages scoped via parent conversation ownership (EXISTS subquery)
- All user_id columns DEFAULT auth.uid() so client inserts succeed

## Indexes
- activity_events: (user_id, created_at desc), (user_id, event_type)
- insights: (user_id, is_dismissed, created_at desc)
- chat_conversations: (user_id, updated_at desc)
- chat_messages: (conversation_id, created_at)
- memories: (user_id, memory_type), (user_id, status)
*/

-- ============================================================
-- 1. ACTIVITY EVENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS activity_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  entity_type text NOT NULL DEFAULT '',
  entity_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE activity_events ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_activity_events_user_created ON activity_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_events_user_type ON activity_events (user_id, event_type);

DROP POLICY IF EXISTS "select_own_activity_events" ON activity_events;
CREATE POLICY "select_own_activity_events" ON activity_events FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_activity_events" ON activity_events;
CREATE POLICY "insert_own_activity_events" ON activity_events FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_activity_events" ON activity_events;
CREATE POLICY "delete_own_activity_events" ON activity_events FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ============================================================
-- 2. INSIGHTS
-- ============================================================
CREATE TABLE IF NOT EXISTS insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  insight_type text NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '[]',
  severity text NOT NULL DEFAULT 'info',
  is_dismissed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE insights ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_insights_user_active ON insights (user_id, is_dismissed, created_at DESC);

DROP POLICY IF EXISTS "select_own_insights" ON insights;
CREATE POLICY "select_own_insights" ON insights FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_insights" ON insights;
CREATE POLICY "insert_own_insights" ON insights FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_insights" ON insights;
CREATE POLICY "update_own_insights" ON insights FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_insights" ON insights;
CREATE POLICY "delete_own_insights" ON insights FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ============================================================
-- 3. CHAT CONVERSATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS chat_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'New Conversation',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE chat_conversations ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_chat_conversations_user_updated ON chat_conversations (user_id, updated_at DESC);

DROP POLICY IF EXISTS "select_own_chat_conversations" ON chat_conversations;
CREATE POLICY "select_own_chat_conversations" ON chat_conversations FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_chat_conversations" ON chat_conversations;
CREATE POLICY "insert_own_chat_conversations" ON chat_conversations FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_chat_conversations" ON chat_conversations;
CREATE POLICY "update_own_chat_conversations" ON chat_conversations FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_chat_conversations" ON chat_conversations;
CREATE POLICY "delete_own_chat_conversations" ON chat_conversations FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ============================================================
-- 4. CHAT MESSAGES
-- ============================================================
CREATE TABLE IF NOT EXISTS chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL,
  content text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation ON chat_messages (conversation_id, created_at);

DROP POLICY IF EXISTS "select_own_chat_messages" ON chat_messages;
CREATE POLICY "select_own_chat_messages" ON chat_messages FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM chat_conversations
      WHERE chat_conversations.id = chat_messages.conversation_id
      AND chat_conversations.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "insert_own_chat_messages" ON chat_messages;
CREATE POLICY "insert_own_chat_messages" ON chat_messages FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM chat_conversations
      WHERE chat_conversations.id = chat_messages.conversation_id
      AND chat_conversations.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "delete_own_chat_messages" ON chat_messages;
CREATE POLICY "delete_own_chat_messages" ON chat_messages FOR DELETE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM chat_conversations
      WHERE chat_conversations.id = chat_messages.conversation_id
      AND chat_conversations.user_id = auth.uid()
    )
  );

-- ============================================================
-- 5. EXTEND MEMORIES TABLE
-- ============================================================
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'memories' AND column_name = 'memory_type'
  ) THEN
    ALTER TABLE memories ADD COLUMN memory_type text NOT NULL DEFAULT 'explicit';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'memories' AND column_name = 'confidence'
  ) THEN
    ALTER TABLE memories ADD COLUMN confidence numeric NOT NULL DEFAULT 1.0;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'memories' AND column_name = 'status'
  ) THEN
    ALTER TABLE memories ADD COLUMN status text NOT NULL DEFAULT 'active';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'memories' AND column_name = 'last_accessed'
  ) THEN
    ALTER TABLE memories ADD COLUMN last_accessed timestamptz;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'memories' AND column_name = 'last_reinforced'
  ) THEN
    ALTER TABLE memories ADD COLUMN last_reinforced timestamptz;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'memories' AND column_name = 'recurrence_count'
  ) THEN
    ALTER TABLE memories ADD COLUMN recurrence_count int NOT NULL DEFAULT 0;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'memories' AND column_name = 'evidence'
  ) THEN
    ALTER TABLE memories ADD COLUMN evidence jsonb NOT NULL DEFAULT '[]';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_memories_user_type ON memories (user_id, memory_type);
CREATE INDEX IF NOT EXISTS idx_memories_user_status ON memories (user_id, status);

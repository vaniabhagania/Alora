/*
# ALORA Core Schema — v1

1. Overview
ALORA is a long-term personal AI agent / operating system for one user. This migration
creates the full relational schema: academic hierarchy, class logs, tasks, quizzes,
memories, journal, future-self identities/goals/habits, novel workspace, themes, and
user profile. All tables are user-owned (multi-user, sign-in required) with RLS.

2. New Tables (all owner-scoped via user_id DEFAULT auth.uid())
- alora_profiles      : display name, current academic phase, streak, preferences
- academic_years      : top of the academic hierarchy (Year 1..4)
- semesters           : belong to an academic year
- courses             : belong to a semester; course code, professor, understanding/confidence
- modules             : belong to a course
- topics              : belong to a module; weak/strong flags
- classes             : a learning session under a topic (timestamped)
- class_logs          : raw + structured notes for a class (raw_thoughts preserved)
- goals               : long-term goals with progress (created before tasks/memories/journal)
- identities          : future-self identities (created before tasks/memories/habits)
- tasks               : assignments, deadlines, priorities, dependencies
- quizzes             : a quiz attempt container
- quiz_questions      : individual questions in a quiz
- quiz_attempts       : attempt-level scoring and retention metadata
- journal_entries     : reflections with mood, tags, category
- memories            : categorized memory records
- habits              : habits linked to identities/goals
- future_self_profiles: snapshot comparing current vs desired self
- novel_projects      : a novel workspace
- novel_chapters      : chapters in a novel project
- novel_scenes        : scenes in a chapter
- themes              : user-selected monthly aesthetic themes
- settings            : per-user app settings (quiz mix, theme, etc.)

3. Relationships
- academic_years -> semesters -> courses -> modules -> topics -> classes -> class_logs
- tasks optionally link to courses, goals, identities
- quizzes link to courses; quiz_questions link to quizzes; quiz_attempts link to quizzes
- memories link to courses, goals, identities, journal entries
- journal_entries optionally link to courses, goals
- identities -> habits, identities -> goals
- novel_projects -> novel_chapters -> novel_scenes
- themes are per-user; settings are per-user

4. Security
- RLS enabled on every table.
- 4 policies per table (SELECT/INSERT/UPDATE/DELETE), scoped TO authenticated,
  ownership checked via auth.uid() = user_id.
- user_id columns default to auth.uid() so client inserts that omit user_id succeed.

5. Notes
- All timestamps are timestamptz DEFAULT now().
- UUID primary keys default to gen_random_uuid().
- Raw user input (class_logs.raw_thoughts, journal_entries.content, memories.content)
  is NEVER overwritten by AI — separate structured columns hold AI-derived data.
*/

-- ============ PROFILES ============
CREATE TABLE IF NOT EXISTS alora_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL DEFAULT '',
  current_phase text DEFAULT '',
  streak_days int NOT NULL DEFAULT 0,
  last_active_date date,
  preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);
ALTER TABLE alora_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_profile" ON alora_profiles;
CREATE POLICY "select_own_profile" ON alora_profiles FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_profile" ON alora_profiles;
CREATE POLICY "insert_own_profile" ON alora_profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_profile" ON alora_profiles;
CREATE POLICY "update_own_profile" ON alora_profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_profile" ON alora_profiles;
CREATE POLICY "delete_own_profile" ON alora_profiles FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ============ ACADEMIC HIERARCHY ============
CREATE TABLE IF NOT EXISTS academic_years (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT 'Year 1',
  start_date date,
  end_date date,
  position int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE academic_years ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_academic_years" ON academic_years;
CREATE POLICY "select_own_academic_years" ON academic_years FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_academic_years" ON academic_years;
CREATE POLICY "insert_own_academic_years" ON academic_years FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_academic_years" ON academic_years;
CREATE POLICY "update_own_academic_years" ON academic_years FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_academic_years" ON academic_years;
CREATE POLICY "delete_own_academic_years" ON academic_years FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS semesters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  academic_year_id uuid NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT 'Semester 1',
  start_date date,
  end_date date,
  position int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE semesters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_semesters" ON semesters;
CREATE POLICY "select_own_semesters" ON semesters FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_semesters" ON semesters;
CREATE POLICY "insert_own_semesters" ON semesters FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_semesters" ON semesters;
CREATE POLICY "update_own_semesters" ON semesters FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_semesters" ON semesters;
CREATE POLICY "delete_own_semesters" ON semesters FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  semester_id uuid NOT NULL REFERENCES semesters(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  course_code text DEFAULT '',
  professor text DEFAULT '',
  description text DEFAULT '',
  understanding_level text DEFAULT 'medium',
  confidence_level text DEFAULT 'medium',
  weak_topics text[] DEFAULT '{}',
  strong_topics text[] DEFAULT '{}',
  color text DEFAULT '#6366f1',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_courses" ON courses;
CREATE POLICY "select_own_courses" ON courses FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_courses" ON courses;
CREATE POLICY "insert_own_courses" ON courses FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_courses" ON courses;
CREATE POLICY "update_own_courses" ON courses FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_courses" ON courses;
CREATE POLICY "delete_own_courses" ON courses FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text DEFAULT '',
  position int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE modules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_modules" ON modules;
CREATE POLICY "select_own_modules" ON modules FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_modules" ON modules;
CREATE POLICY "insert_own_modules" ON modules FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_modules" ON modules;
CREATE POLICY "update_own_modules" ON modules FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_modules" ON modules;
CREATE POLICY "delete_own_modules" ON modules FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS topics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id uuid NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  is_weak boolean NOT NULL DEFAULT false,
  is_strong boolean NOT NULL DEFAULT false,
  understanding_level text DEFAULT 'medium',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE topics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_topics" ON topics;
CREATE POLICY "select_own_topics" ON topics FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_topics" ON topics;
CREATE POLICY "insert_own_topics" ON topics FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_topics" ON topics;
CREATE POLICY "update_own_topics" ON topics FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_topics" ON topics;
CREATE POLICY "delete_own_topics" ON topics FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id uuid REFERENCES topics(id) ON DELETE SET NULL,
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'Class Session',
  session_date timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE classes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_classes" ON classes;
CREATE POLICY "select_own_classes" ON classes FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_classes" ON classes;
CREATE POLICY "insert_own_classes" ON classes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_classes" ON classes;
CREATE POLICY "update_own_classes" ON classes FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_classes" ON classes;
CREATE POLICY "delete_own_classes" ON classes FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS class_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  raw_thoughts text NOT NULL DEFAULT '',
  structured_notes jsonb NOT NULL DEFAULT '{}'::jsonb,
  understanding_rating int DEFAULT 3,
  usefulness_rating int DEFAULT 3,
  questions text[] DEFAULT '{}',
  confusions text[] DEFAULT '{}',
  learnings text[] DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE class_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_class_logs" ON class_logs;
CREATE POLICY "select_own_class_logs" ON class_logs FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_class_logs" ON class_logs;
CREATE POLICY "insert_own_class_logs" ON class_logs FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_class_logs" ON class_logs;
CREATE POLICY "update_own_class_logs" ON class_logs FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_class_logs" ON class_logs;
CREATE POLICY "delete_own_class_logs" ON class_logs FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ============ GOALS (before tasks/memories/journal) ============
CREATE TABLE IF NOT EXISTS goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text DEFAULT '',
  target_date date,
  progress int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE goals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_goals" ON goals;
CREATE POLICY "select_own_goals" ON goals FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_goals" ON goals;
CREATE POLICY "insert_own_goals" ON goals FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_goals" ON goals;
CREATE POLICY "update_own_goals" ON goals FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_goals" ON goals;
CREATE POLICY "delete_own_goals" ON goals FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ============ IDENTITIES (before tasks/memories/habits) ============
CREATE TABLE IF NOT EXISTS identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  vision text DEFAULT '',
  why_it_matters text DEFAULT '',
  skills_required text[] DEFAULT '{}',
  current_level jsonb DEFAULT '[]'::jsonb,
  target_level jsonb DEFAULT '[]'::jsonb,
  projects text[] DEFAULT '{}',
  milestones jsonb DEFAULT '[]'::jsonb,
  deadlines jsonb DEFAULT '[]'::jsonb,
  progress int NOT NULL DEFAULT 0,
  color text DEFAULT '#6366f1',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE identities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_identities" ON identities;
CREATE POLICY "select_own_identities" ON identities FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_identities" ON identities;
CREATE POLICY "insert_own_identities" ON identities FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_identities" ON identities;
CREATE POLICY "update_own_identities" ON identities FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_identities" ON identities;
CREATE POLICY "delete_own_identities" ON identities FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ============ TASKS ============
CREATE TABLE IF NOT EXISTS tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text DEFAULT '',
  priority text NOT NULL DEFAULT 'medium',
  status text NOT NULL DEFAULT 'todo',
  category text DEFAULT 'academic',
  deadline timestamptz,
  estimated_effort text DEFAULT '',
  related_course_id uuid REFERENCES courses(id) ON DELETE SET NULL,
  related_goal_id uuid REFERENCES goals(id) ON DELETE SET NULL,
  related_identity_id uuid REFERENCES identities(id) ON DELETE SET NULL,
  depends_on uuid REFERENCES tasks(id) ON DELETE SET NULL,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_tasks" ON tasks;
CREATE POLICY "select_own_tasks" ON tasks FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_tasks" ON tasks;
CREATE POLICY "insert_own_tasks" ON tasks FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_tasks" ON tasks;
CREATE POLICY "update_own_tasks" ON tasks FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_tasks" ON tasks;
CREATE POLICY "delete_own_tasks" ON tasks FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ============ QUIZZES ============
CREATE TABLE IF NOT EXISTS quizzes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id uuid REFERENCES courses(id) ON DELETE SET NULL,
  title text NOT NULL DEFAULT 'Daily Quiz',
  quiz_date timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'in_progress',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE quizzes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_quizzes" ON quizzes;
CREATE POLICY "select_own_quizzes" ON quizzes FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_quizzes" ON quizzes;
CREATE POLICY "insert_own_quizzes" ON quizzes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_quizzes" ON quizzes;
CREATE POLICY "update_own_quizzes" ON quizzes FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_quizzes" ON quizzes;
CREATE POLICY "delete_own_quizzes" ON quizzes FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS quiz_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id uuid NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  question_type text NOT NULL DEFAULT 'mcq',
  question text NOT NULL,
  options jsonb DEFAULT '[]'::jsonb,
  correct_answer text DEFAULT '',
  user_answer text DEFAULT '',
  is_correct boolean DEFAULT false,
  explanation text DEFAULT '',
  topic text DEFAULT '',
  difficulty text DEFAULT 'medium',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE quiz_questions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_quiz_questions" ON quiz_questions;
CREATE POLICY "select_own_quiz_questions" ON quiz_questions FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_quiz_questions" ON quiz_questions;
CREATE POLICY "insert_own_quiz_questions" ON quiz_questions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_quiz_questions" ON quiz_questions;
CREATE POLICY "update_own_quiz_questions" ON quiz_questions FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_quiz_questions" ON quiz_questions;
CREATE POLICY "delete_own_quiz_questions" ON quiz_questions FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS quiz_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id uuid NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  score numeric NOT NULL DEFAULT 0,
  total_questions int NOT NULL DEFAULT 0,
  correct_count int NOT NULL DEFAULT 0,
  concepts_mastered text[] DEFAULT '{}',
  concepts_needing_review text[] DEFAULT '{}',
  retention_trend jsonb DEFAULT '[]'::jsonb,
  completed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE quiz_attempts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_quiz_attempts" ON quiz_attempts;
CREATE POLICY "select_own_quiz_attempts" ON quiz_attempts FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_quiz_attempts" ON quiz_attempts;
CREATE POLICY "insert_own_quiz_attempts" ON quiz_attempts FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_quiz_attempts" ON quiz_attempts;
CREATE POLICY "update_own_quiz_attempts" ON quiz_attempts FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_quiz_attempts" ON quiz_attempts;
CREATE POLICY "delete_own_quiz_attempts" ON quiz_attempts FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ============ JOURNAL ============
CREATE TABLE IF NOT EXISTS journal_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  content text NOT NULL,
  mood text DEFAULT '',
  category text DEFAULT 'reflection',
  tags text[] DEFAULT '{}',
  related_course_id uuid REFERENCES courses(id) ON DELETE SET NULL,
  related_goal_id uuid REFERENCES goals(id) ON DELETE SET NULL,
  is_novel_eligible boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_journal" ON journal_entries;
CREATE POLICY "select_own_journal" ON journal_entries FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_journal" ON journal_entries;
CREATE POLICY "insert_own_journal" ON journal_entries FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_journal" ON journal_entries;
CREATE POLICY "update_own_journal" ON journal_entries FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_journal" ON journal_entries;
CREATE POLICY "delete_own_journal" ON journal_entries FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ============ MEMORIES ============
CREATE TABLE IF NOT EXISTS memories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  content text NOT NULL,
  source text NOT NULL DEFAULT 'manual',
  category text NOT NULL DEFAULT 'academic',
  importance text DEFAULT 'normal',
  related_course_id uuid REFERENCES courses(id) ON DELETE SET NULL,
  related_goal_id uuid REFERENCES goals(id) ON DELETE SET NULL,
  related_identity_id uuid REFERENCES identities(id) ON DELETE SET NULL,
  related_journal_id uuid REFERENCES journal_entries(id) ON DELETE SET NULL,
  tags text[] DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE memories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_memories" ON memories;
CREATE POLICY "select_own_memories" ON memories FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_memories" ON memories;
CREATE POLICY "insert_own_memories" ON memories FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_memories" ON memories;
CREATE POLICY "update_own_memories" ON memories FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_memories" ON memories;
CREATE POLICY "delete_own_memories" ON memories FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ============ HABITS ============
CREATE TABLE IF NOT EXISTS habits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  identity_id uuid REFERENCES identities(id) ON DELETE SET NULL,
  goal_id uuid REFERENCES goals(id) ON DELETE SET NULL,
  name text NOT NULL,
  frequency text DEFAULT 'daily',
  streak int NOT NULL DEFAULT 0,
  last_completed date,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE habits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_habits" ON habits;
CREATE POLICY "select_own_habits" ON habits FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_habits" ON habits;
CREATE POLICY "insert_own_habits" ON habits FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_habits" ON habits;
CREATE POLICY "update_own_habits" ON habits FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_habits" ON habits;
CREATE POLICY "delete_own_habits" ON habits FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ============ FUTURE SELF PROFILES ============
CREATE TABLE IF NOT EXISTS future_self_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  snapshot_date timestamptz NOT NULL DEFAULT now(),
  current_self_summary text DEFAULT '',
  desired_self_summary text DEFAULT '',
  skills_missing text[] DEFAULT '{}',
  habits_missing text[] DEFAULT '{}',
  work_avoided text[] DEFAULT '{}',
  progress_made text[] DEFAULT '{}',
  next_actions text[] DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE future_self_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_fsp" ON future_self_profiles;
CREATE POLICY "select_own_fsp" ON future_self_profiles FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_fsp" ON future_self_profiles;
CREATE POLICY "insert_own_fsp" ON future_self_profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_fsp" ON future_self_profiles;
CREATE POLICY "update_own_fsp" ON future_self_profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_fsp" ON future_self_profiles;
CREATE POLICY "delete_own_fsp" ON future_self_profiles FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ============ NOVEL ============
CREATE TABLE IF NOT EXISTS novel_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'My Journey',
  description text DEFAULT '',
  themes text[] DEFAULT '{}',
  characters jsonb DEFAULT '[]'::jsonb,
  timeline jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE novel_projects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_novel_projects" ON novel_projects;
CREATE POLICY "select_own_novel_projects" ON novel_projects FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_novel_projects" ON novel_projects;
CREATE POLICY "insert_own_novel_projects" ON novel_projects FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_novel_projects" ON novel_projects;
CREATE POLICY "update_own_novel_projects" ON novel_projects FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_novel_projects" ON novel_projects;
CREATE POLICY "delete_own_novel_projects" ON novel_projects FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS novel_chapters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  novel_project_id uuid NOT NULL REFERENCES novel_projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  summary text DEFAULT '',
  position int NOT NULL DEFAULT 1,
  status text DEFAULT 'draft',
  source_memory_ids uuid[] DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE novel_chapters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_novel_chapters" ON novel_chapters;
CREATE POLICY "select_own_novel_chapters" ON novel_chapters FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_novel_chapters" ON novel_chapters;
CREATE POLICY "insert_own_novel_chapters" ON novel_chapters FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_novel_chapters" ON novel_chapters;
CREATE POLICY "update_own_novel_chapters" ON novel_chapters FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_novel_chapters" ON novel_chapters;
CREATE POLICY "delete_own_novel_chapters" ON novel_chapters FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS novel_scenes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id uuid NOT NULL REFERENCES novel_chapters(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  raw_content text DEFAULT '',
  curated_content text DEFAULT '',
  ai_suggestions jsonb DEFAULT '[]'::jsonb,
  position int NOT NULL DEFAULT 1,
  source_memory_id uuid REFERENCES journal_entries(id) ON DELETE SET NULL,
  source_class_log_id uuid REFERENCES class_logs(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE novel_scenes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_novel_scenes" ON novel_scenes;
CREATE POLICY "select_own_novel_scenes" ON novel_scenes FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_novel_scenes" ON novel_scenes;
CREATE POLICY "insert_own_novel_scenes" ON novel_scenes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_novel_scenes" ON novel_scenes;
CREATE POLICY "update_own_novel_scenes" ON novel_scenes FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_novel_scenes" ON novel_scenes;
CREATE POLICY "delete_own_novel_scenes" ON novel_scenes FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ============ THEMES ============
CREATE TABLE IF NOT EXISTS themes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  inspiration text DEFAULT '',
  month text NOT NULL,
  bg_primary text DEFAULT '#0a0a0f',
  bg_secondary text DEFAULT '#12121a',
  accent text DEFAULT '#6366f1',
  accent_secondary text DEFAULT '#a78bfa',
  text_primary text DEFAULT '#f4f4f5',
  text_secondary text DEFAULT '#a1a1aa',
  card_bg text DEFAULT 'rgba(255,255,255,0.04)',
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE themes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_themes" ON themes;
CREATE POLICY "select_own_themes" ON themes FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_themes" ON themes;
CREATE POLICY "insert_own_themes" ON themes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_themes" ON themes;
CREATE POLICY "update_own_themes" ON themes FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_themes" ON themes;
CREATE POLICY "delete_own_themes" ON themes FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ============ SETTINGS ============
CREATE TABLE IF NOT EXISTS settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  quiz_mix jsonb NOT NULL DEFAULT '{"recent":40,"older":30,"weak":15,"upcoming":10,"lateral":5}'::jsonb,
  active_theme_id uuid REFERENCES themes(id) ON DELETE SET NULL,
  ai_provider text DEFAULT '',
  notifications_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_settings" ON settings;
CREATE POLICY "select_own_settings" ON settings FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_settings" ON settings;
CREATE POLICY "insert_own_settings" ON settings FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_settings" ON settings;
CREATE POLICY "update_own_settings" ON settings FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_settings" ON settings;
CREATE POLICY "delete_own_settings" ON settings FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ============ INDEXES ============
CREATE INDEX IF NOT EXISTS idx_academic_years_user ON academic_years(user_id);
CREATE INDEX IF NOT EXISTS idx_semesters_year ON semesters(academic_year_id);
CREATE INDEX IF NOT EXISTS idx_courses_semester ON courses(semester_id);
CREATE INDEX IF NOT EXISTS idx_courses_user ON courses(user_id);
CREATE INDEX IF NOT EXISTS idx_modules_course ON modules(course_id);
CREATE INDEX IF NOT EXISTS idx_topics_module ON topics(module_id);
CREATE INDEX IF NOT EXISTS idx_classes_course ON classes(course_id);
CREATE INDEX IF NOT EXISTS idx_classes_topic ON classes(topic_id);
CREATE INDEX IF NOT EXISTS idx_class_logs_class ON class_logs(class_id);
CREATE INDEX IF NOT EXISTS idx_tasks_user ON tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_deadline ON tasks(deadline);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_quizzes_user ON quizzes(user_id);
CREATE INDEX IF NOT EXISTS idx_quiz_questions_quiz ON quiz_questions(quiz_id);
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_quiz ON quiz_attempts(quiz_id);
CREATE INDEX IF NOT EXISTS idx_memories_user ON memories(user_id);
CREATE INDEX IF NOT EXISTS idx_memories_category ON memories(category);
CREATE INDEX IF NOT EXISTS idx_journal_user ON journal_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_goals_user ON goals(user_id);
CREATE INDEX IF NOT EXISTS idx_identities_user ON identities(user_id);
CREATE INDEX IF NOT EXISTS idx_habits_user ON habits(user_id);
CREATE INDEX IF NOT EXISTS idx_novel_chapters_project ON novel_chapters(novel_project_id);
CREATE INDEX IF NOT EXISTS idx_novel_scenes_chapter ON novel_scenes(chapter_id);
CREATE INDEX IF NOT EXISTS idx_themes_user ON themes(user_id);

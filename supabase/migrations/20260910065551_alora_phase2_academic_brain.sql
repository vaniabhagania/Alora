/*
# ALORA Phase 2: Academic Brain

Enriches the existing topics table with detailed tracking fields and adds
archive flags to the academic hierarchy tables. Reuses all existing tables.

1. Changes to `topics`:
   - description (text)
   - confidence (int, 0-100, default 50)
   - last_studied (timestamptz, nullable)
   - review_count (int, default 0)
   - mistakes (text[], default '{}')
   - status (text: not_started|introduced|learning|understood|strong|mastered, default 'not_started')
   - archived (boolean, default false)

2. Archive flags added to: academic_years, semesters, courses, modules
   - archived boolean NOT NULL DEFAULT false

3. RLS policies already exist on topics; no new policies needed since we are
   only adding columns, not changing ownership or access patterns.
*/

-- ============ ENRICH TOPICS ============
ALTER TABLE topics ADD COLUMN IF NOT EXISTS description text DEFAULT '';
ALTER TABLE topics ADD COLUMN IF NOT EXISTS confidence int DEFAULT 50;
ALTER TABLE topics ADD COLUMN IF NOT EXISTS last_studied timestamptz;
ALTER TABLE topics ADD COLUMN IF NOT EXISTS review_count int NOT NULL DEFAULT 0;
ALTER TABLE topics ADD COLUMN IF NOT EXISTS mistakes text[] DEFAULT '{}';
ALTER TABLE topics ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'not_started';
ALTER TABLE topics ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;

-- ============ ARCHIVE FLAGS ON HIERARCHY ============
ALTER TABLE academic_years ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;
ALTER TABLE semesters ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;
ALTER TABLE modules ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;

-- ============ INDEXES FOR WEAK SPOT ENGINE ============
CREATE INDEX IF NOT EXISTS idx_topics_status ON topics(status);
CREATE INDEX IF NOT EXISTS idx_topics_confidence ON topics(confidence);
CREATE INDEX IF NOT EXISTS idx_topics_archived ON topics(archived);
CREATE INDEX IF NOT EXISTS idx_courses_archived ON courses(archived);
CREATE INDEX IF NOT EXISTS idx_modules_archived ON modules(archived);
CREATE INDEX IF NOT EXISTS idx_semesters_archived ON semesters(archived);
CREATE INDEX IF NOT EXISTS idx_academic_years_archived ON academic_years(archived);

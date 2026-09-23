ALTER TABLE courses ADD COLUMN IF NOT EXISTS position int NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_courses_position ON courses(position);
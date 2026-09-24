ALTER TABLE settings ADD COLUMN IF NOT EXISTS hidden_nav_items text[] NOT NULL DEFAULT '{}';

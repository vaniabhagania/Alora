ALTER TABLE settings ADD COLUMN IF NOT EXISTS theme_mode text NOT NULL DEFAULT 'light';
ALTER TABLE settings DROP CONSTRAINT IF EXISTS settings_theme_mode_check;
ALTER TABLE settings ADD CONSTRAINT settings_theme_mode_check CHECK (theme_mode IN ('light', 'dark'));

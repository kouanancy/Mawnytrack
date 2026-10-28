-- Mawnytrack · 006 · Mois budgétaire
-- Appliqué automatiquement au déploiement par scripts/migrate.mjs.
-- Un « mois » commence le jour start_day (1 à 28) et porte le nom du mois où il se termine (period_naming = 'end')
-- ou de celui où il commence ('start'). Par défaut : le 1er, soit les mois du calendrier.

ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS start_day smallint NOT NULL DEFAULT 1 CHECK (start_day BETWEEN 1 AND 28);
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS period_naming text NOT NULL DEFAULT 'end' CHECK (period_naming IN ('end', 'start'));

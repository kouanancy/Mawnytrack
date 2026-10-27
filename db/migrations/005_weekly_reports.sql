-- Mawnytrack · 005 · Rapports hebdomadaires
-- Appliqué automatiquement au déploiement par scripts/migrate.mjs.

-- Rapport d'une semaine (lundi → dimanche, fuseau de l'application), données figées à la génération
CREATE TABLE IF NOT EXISTS weekly_reports (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week_start   date NOT NULL CHECK (extract(isodow FROM week_start) = 1),
  week_end     date NOT NULL CHECK (week_end = week_start + 6),
  generated_at timestamptz NOT NULL DEFAULT now(),
  sent_at      timestamptz,
  data         jsonb NOT NULL,
  UNIQUE (user_id, week_start)
);
CREATE INDEX IF NOT EXISTS weekly_reports_user_idx ON weekly_reports (user_id, week_start DESC);

-- Réglage : recevoir le rapport hebdomadaire par e-mail (activé par défaut)
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS weekly_email boolean NOT NULL DEFAULT true;

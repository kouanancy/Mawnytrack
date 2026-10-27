-- Mawnytrack · 003 · Réglages de l'utilisateur (thème d'affichage)
-- Appliqué automatiquement au déploiement par scripts/migrate.mjs.

CREATE TABLE IF NOT EXISTS user_settings (
  user_id    text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  theme      text NOT NULL DEFAULT 'auto' CHECK (theme IN ('auto', 'light', 'dark')),
  updated_at timestamptz NOT NULL DEFAULT now()
);

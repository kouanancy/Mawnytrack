-- Mawnytrack · 004 · Volet Prêts
-- Appliqué automatiquement au déploiement par scripts/migrate.mjs.
-- Les prêts, emprunts et remboursements restent dérivés de la table transactions (aucune donnée en double) ;
-- cette migration garantit seulement qu'une personne n'existe qu'une fois par sens (prêté / emprunté).

CREATE UNIQUE INDEX IF NOT EXISTS people_user_name_direction_uidx
  ON people (user_id, lower(btrim(name)), direction);

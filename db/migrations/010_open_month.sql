-- Mawnytrack · 010 · Mois en cours ouvert jusqu'à sa clôture (bouton « Clôturer »)
-- Appliqué automatiquement au déploiement par scripts/migrate.mjs.

-- Le mois en cours n'a pas de date de fin (end_date NULL) : il reste ouvert jusqu'à sa clôture.
ALTER TABLE budget_periods ALTER COLUMN end_date DROP NOT NULL;

-- Un seul mois ouvert par utilisateur
CREATE UNIQUE INDEX IF NOT EXISTS budget_periods_open_uidx ON budget_periods (user_id) WHERE end_date IS NULL;

-- Sans trou ni chevauchement, et le mois ouvert est toujours le dernier (vérifié en fin de transaction)
CREATE OR REPLACE FUNCTION budget_periods_contiguous() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  u text;
BEGIN
  IF tg_op = 'DELETE' THEN
    u := old.user_id;
  ELSE
    u := new.user_id;
  END IF;
  IF EXISTS (
    SELECT 1 FROM budget_periods a
    WHERE a.user_id = u
      AND a.start_date > (SELECT min(start_date) FROM budget_periods WHERE user_id = u)
      AND NOT EXISTS (
        SELECT 1 FROM budget_periods b
        WHERE b.user_id = u AND b.end_date = a.start_date - 1 AND b.month = (a.month - interval '1 month')::date
      )
  ) OR EXISTS (
    SELECT 1 FROM budget_periods o JOIN budget_periods l ON l.user_id = o.user_id AND l.start_date > o.start_date
    WHERE o.user_id = u AND o.end_date IS NULL
  ) THEN
    RAISE EXCEPTION 'Les mois budgétaires doivent se suivre sans trou ni chevauchement.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END
$$;

-- Reprise : les mois futurs déjà enregistrés redeviennent des mois prévus (non enregistrés) ; les budgets préparés
-- pour ces mois restent dans monthly_budgets (clé du mois, period_id remis à NULL par la clé étrangère).
DELETE FROM budget_periods WHERE start_date > (now() AT TIME ZONE 'Africa/Abidjan')::date;

-- Le dernier mois de chaque utilisateur (celui qui contient aujourd'hui) devient le mois en cours, ouvert.
UPDATE budget_periods bp SET end_date = NULL, closed_at = NULL
WHERE bp.start_date = (SELECT max(b.start_date) FROM budget_periods b WHERE b.user_id = bp.user_id);

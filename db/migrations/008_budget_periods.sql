-- Mawnytrack · 008 · Dates d'ouverture et de clôture de chaque mois, ligne « Dépenses non répertoriées »
-- Appliqué automatiquement au déploiement par scripts/migrate.mjs.

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Un mois budgétaire = une période enregistrée. month : clé (1er jour du mois de la clé, comme
-- monthly_budgets.month), les clés se suivent de mois en mois ; name : nom affiché (NULL = mois de la clé).
CREATE TABLE IF NOT EXISTS budget_periods (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month      date NOT NULL CHECK (extract(day FROM month) = 1),
  name       text CHECK (name IS NULL OR length(btrim(name)) BETWEEN 1 AND 40),
  start_date date NOT NULL,
  end_date   date NOT NULL,
  closed_at  timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date),
  UNIQUE (id, user_id),
  UNIQUE (user_id, month),
  -- Jamais de chevauchement (vérifié en fin de transaction : plusieurs périodes changent ensemble)
  CONSTRAINT budget_periods_no_overlap EXCLUDE USING gist (user_id WITH =, daterange(start_date, end_date, '[]') WITH &&)
    DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX IF NOT EXISTS budget_periods_user_start_idx ON budget_periods (user_id, start_date);

-- Jamais de trou : chaque période (sauf la première) s'ouvre le lendemain de la clôture de la précédente,
-- dont la clé est le mois d'avant. Vérifié en fin de transaction.
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
  ) THEN
    RAISE EXCEPTION 'Les mois budgétaires doivent se suivre sans trou ni chevauchement.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END
$$;

DROP TRIGGER IF EXISTS budget_periods_contiguous ON budget_periods;
CREATE CONSTRAINT TRIGGER budget_periods_contiguous
  AFTER INSERT OR UPDATE OR DELETE ON budget_periods
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION budget_periods_contiguous();

-- Reprise : périodes selon le réglage actuel, du premier mouvement (ou du premier budget figé) jusqu'à aujourd'hui
WITH s AS (
  SELECT u.id AS user_id, coalesce(us.start_day, 1) AS sd, coalesce(us.period_naming, 'end') AS nm,
    (now() AT TIME ZONE 'Africa/Abidjan')::date AS today
  FROM users u LEFT JOIN user_settings us ON us.user_id = u.id
), d AS (
  SELECT s.*, least(
      (SELECT min((occurred_at AT TIME ZONE 'Africa/Abidjan')::date) FROM transactions t WHERE t.user_id = s.user_id),
      (SELECT min((occurred_at AT TIME ZONE 'Africa/Abidjan')::date) FROM project_disbursements x WHERE x.user_id = s.user_id),
      (SELECT min((occurred_at AT TIME ZONE 'Africa/Abidjan')::date) FROM project_moves x WHERE x.user_id = s.user_id),
      s.today) AS first_day,
    (SELECT min(month) FROM monthly_budgets mb WHERE mb.user_id = s.user_id) AS first_frozen,
    CASE WHEN s.nm = 'end' AND s.sd > 1 THEN 1 ELSE 0 END AS shift
  FROM s
), k AS (
  SELECT d.*,
    (date_trunc('month', d.first_day - (d.sd - 1)) + make_interval(months => d.shift))::date AS k_first,
    (date_trunc('month', d.today - (d.sd - 1)) + make_interval(months => d.shift))::date AS k_today
  FROM d
)
INSERT INTO budget_periods (user_id, month, start_date, end_date)
SELECT k.user_id, g.m::date,
  (g.m - make_interval(months => k.shift))::date + (k.sd - 1),
  ((g.m - make_interval(months => k.shift))::date + (k.sd - 1) + interval '1 month')::date - 1
FROM k
CROSS JOIN LATERAL generate_series(least(k.k_first, coalesce(k.first_frozen, k.k_first)), k.k_today, interval '1 month') AS g(m)
ON CONFLICT (user_id, month) DO NOTHING;

-- Budgets figés rattachés à leur période (montants conservés)
ALTER TABLE monthly_budgets ADD COLUMN IF NOT EXISTS period_id uuid;
UPDATE monthly_budgets mb SET period_id = bp.id
FROM budget_periods bp
WHERE bp.user_id = mb.user_id AND bp.month = mb.month AND mb.period_id IS NULL;
ALTER TABLE monthly_budgets DROP CONSTRAINT IF EXISTS monthly_budgets_period_fk;
ALTER TABLE monthly_budgets ADD CONSTRAINT monthly_budgets_period_fk
  FOREIGN KEY (period_id, user_id) REFERENCES budget_periods (id, user_id) ON DELETE SET NULL (period_id);

-- Ligne système « Dépenses non répertoriées » : une par utilisateur, budget prévu 0 (sans plafond)
ALTER TABLE budget_lines ADD COLUMN IF NOT EXISTS system text CHECK (system IN ('unlisted'));
ALTER TABLE budget_lines DROP CONSTRAINT IF EXISTS budget_lines_system_planned;
ALTER TABLE budget_lines ADD CONSTRAINT budget_lines_system_planned CHECK (system IS NULL OR (planned = 0 AND person_id IS NULL));
CREATE UNIQUE INDEX IF NOT EXISTS budget_lines_system_uidx ON budget_lines (user_id) WHERE system IS NOT NULL;
INSERT INTO budget_lines (user_id, label, planned, position, system)
SELECT u.id, 'Dépenses non répertoriées', 0,
  coalesce((SELECT max(position) FROM budget_lines bl WHERE bl.user_id = u.id), 0) + 1, 'unlisted'
FROM users u
ON CONFLICT (user_id) WHERE system IS NOT NULL DO NOTHING;

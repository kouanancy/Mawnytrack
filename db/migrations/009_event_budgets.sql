-- Mawnytrack · 009 · Budgets d'événement ; les investissements deviennent des projets
-- Appliqué automatiquement au déploiement par scripts/migrate.mjs.

-- Budget d'événement : liste indépendante (sans lien avec la caisse, le budget mensuel ni les dépenses)
CREATE TABLE IF NOT EXISTS event_budgets (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
  event_date date,
  notes      text NOT NULL DEFAULT '' CHECK (length(notes) <= 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, user_id)
);
CREATE INDEX IF NOT EXISTS event_budgets_user_idx ON event_budgets (user_id, created_at);

-- Article : montant total seulement (ni quantité ni prix unitaire), classé par catégorie, ordre libre
CREATE TABLE IF NOT EXISTS event_budget_items (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_id uuid NOT NULL,
  user_id   text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category  text NOT NULL CHECK (length(btrim(category)) BETWEEN 1 AND 60),
  label     text NOT NULL CHECK (length(btrim(label)) BETWEEN 1 AND 120),
  amount    bigint NOT NULL CHECK (amount >= 0),
  position  integer NOT NULL DEFAULT 0,
  FOREIGN KEY (budget_id, user_id) REFERENCES event_budgets (id, user_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS event_budget_items_budget_idx ON event_budget_items (user_id, budget_id, position);

-- Le type « Investissement » disparaît : chaque investissement devient un projet, ses sorties de caisse des
-- approvisionnements (même montant, libellé et date) ; le total sorti de la caisse principale est inchangé.
INSERT INTO project_moves (user_id, project_id, type, amount, label, occurred_at, created_at)
SELECT d.user_id, d.project_id, 'fund', d.amount, d.label, d.occurred_at, d.created_at
FROM project_disbursements d
JOIN projects p ON p.id = d.project_id AND p.user_id = d.user_id
WHERE p.kind = 'investment';

DELETE FROM project_disbursements d
USING projects p
WHERE p.id = d.project_id AND p.user_id = d.user_id AND p.kind = 'investment';

UPDATE projects SET kind = 'project' WHERE kind = 'investment';

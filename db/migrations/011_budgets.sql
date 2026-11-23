-- Mawnytrack · 011 · Budgets génériques (rentrée scolaire, travaux, voyage, fête…) à catégories
-- Appliqué automatiquement au déploiement par scripts/migrate.mjs.

-- Budget : liste indépendante (sans lien avec la caisse, le budget mensuel ni les dépenses)
CREATE TABLE IF NOT EXISTS budgets (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, user_id)
);
CREATE INDEX IF NOT EXISTS budgets_user_idx ON budgets (user_id, created_at);

-- Catégorie d'un budget (ordre libre)
CREATE TABLE IF NOT EXISTS budget_categories (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_id uuid NOT NULL,
  user_id   text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name      text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 60),
  position  integer NOT NULL DEFAULT 0,
  UNIQUE (id, user_id),
  FOREIGN KEY (budget_id, user_id) REFERENCES budgets (id, user_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS budget_categories_budget_idx ON budget_categories (user_id, budget_id, position);

-- Ligne d'une catégorie : libellé et montant seulement (ni quantité ni prix unitaire), ordre libre
CREATE TABLE IF NOT EXISTS budget_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL,
  user_id     text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label       text NOT NULL CHECK (length(btrim(label)) BETWEEN 1 AND 120),
  amount      bigint NOT NULL CHECK (amount >= 0),
  position    integer NOT NULL DEFAULT 0,
  FOREIGN KEY (category_id, user_id) REFERENCES budget_categories (id, user_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS budget_items_category_idx ON budget_items (user_id, category_id, position);

-- Reprise des budgets d'événement (009) : même identifiant et même nom ; une catégorie par catégorie d'article
-- (ordre de leur premier article), lignes dans le même ordre. La date de l'événement et les notes disparaissent.
INSERT INTO budgets (id, user_id, name, created_at)
SELECT id, user_id, name, created_at FROM event_budgets
ON CONFLICT (id) DO NOTHING;

INSERT INTO budget_categories (budget_id, user_id, name, position)
SELECT budget_id, user_id, left(btrim(category), 60),
  row_number() OVER (PARTITION BY budget_id ORDER BY min(position), category)
FROM event_budget_items
GROUP BY budget_id, user_id, category;

INSERT INTO budget_items (category_id, user_id, label, amount, position)
SELECT c.id, i.user_id, i.label, i.amount, row_number() OVER (PARTITION BY c.id ORDER BY i.position, i.id)
FROM event_budget_items i
JOIN budget_categories c ON c.budget_id = i.budget_id AND c.user_id = i.user_id AND c.name = left(btrim(i.category), 60);

DROP TABLE IF EXISTS event_budget_items;
DROP TABLE IF EXISTS event_budgets;

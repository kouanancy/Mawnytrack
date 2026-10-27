-- Mawnytrack · 002 · Schéma applicatif complet (toutes les étapes)
-- Prérequis : 001_auth.sql. À exécuter tel quel dans l'éditeur SQL de Neon (PostgreSQL 15 ou plus).
-- Montants en FCFA, entiers (bigint). Chaque table porte user_id ; les clés étrangères
-- composites (id, user_id) empêchent toute référence croisée entre utilisateurs.

-- Personnes : prêts accordés ('lent') ou emprunts ('borrowed')
CREATE TABLE IF NOT EXISTS people (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
  direction  text NOT NULL CHECK (direction IN ('lent', 'borrowed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, user_id)
);
CREATE INDEX IF NOT EXISTS people_user_idx ON people (user_id);

-- Lignes de budget : planned = budget prévu par défaut (0 = pas de plafond)
CREATE TABLE IF NOT EXISTS budget_lines (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label      text NOT NULL CHECK (length(btrim(label)) BETWEEN 1 AND 80),
  planned    bigint NOT NULL DEFAULT 0 CHECK (planned >= 0),
  person_id  uuid,
  position   integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, user_id),
  FOREIGN KEY (person_id, user_id) REFERENCES people (id, user_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS budget_lines_user_idx ON budget_lines (user_id, position);
CREATE UNIQUE INDEX IF NOT EXISTS budget_lines_person_uidx ON budget_lines (person_id) WHERE person_id IS NOT NULL;

-- Budget d'un mois donné (month = 1er du mois). Absent : budget_lines.planned s'applique.
-- Les mois terminés y sont figés à leur première consultation.
CREATE TABLE IF NOT EXISTS monthly_budgets (
  id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  line_id uuid NOT NULL,
  month   date NOT NULL CHECK (extract(day FROM month) = 1),
  planned bigint NOT NULL CHECK (planned >= 0),
  UNIQUE (line_id, month),
  FOREIGN KEY (line_id, user_id) REFERENCES budget_lines (id, user_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS monthly_budgets_user_month_idx ON monthly_budgets (user_id, month);

-- Transactions : source unique de vérité
--   income  : revenu
--   expense : dépense (sur une ligne 'lent' = nouveau prêt ; sur une ligne 'borrowed' = remboursement d'emprunt)
--   refund  : remboursement reçu d'une personne 'lent'
--   borrow  : argent emprunté reçu d'une personne 'borrowed'
CREATE TABLE IF NOT EXISTS transactions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('income', 'expense', 'refund', 'borrow')),
  amount      bigint NOT NULL CHECK (amount > 0),
  label       text NOT NULL DEFAULT '' CHECK (length(label) <= 120),
  line_id     uuid,
  person_id   uuid,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (line_id, user_id) REFERENCES budget_lines (id, user_id) ON DELETE SET NULL (line_id),
  FOREIGN KEY (person_id, user_id) REFERENCES people (id, user_id) ON DELETE SET NULL (person_id)
);
CREATE INDEX IF NOT EXISTS transactions_user_occurred_idx ON transactions (user_id, occurred_at);
CREATE INDEX IF NOT EXISTS transactions_user_line_idx ON transactions (user_id, line_id);
CREATE INDEX IF NOT EXISTS transactions_user_person_idx ON transactions (user_id, person_id) WHERE person_id IS NOT NULL;

-- Investissements et projets, financés par la caisse
CREATE TABLE IF NOT EXISTS projects (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
  kind       text NOT NULL CHECK (kind IN ('investment', 'project')),
  target     bigint NOT NULL DEFAULT 0 CHECK (target >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, user_id)
);
CREATE INDEX IF NOT EXISTS projects_user_idx ON projects (user_id);

CREATE TABLE IF NOT EXISTS project_disbursements (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id  uuid NOT NULL,
  amount      bigint NOT NULL CHECK (amount > 0),
  label       text NOT NULL DEFAULT '' CHECK (length(label) <= 120),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (project_id, user_id) REFERENCES projects (id, user_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS project_disbursements_user_occurred_idx ON project_disbursements (user_id, occurred_at);
CREATE INDEX IF NOT EXISTS project_disbursements_project_idx ON project_disbursements (user_id, project_id);

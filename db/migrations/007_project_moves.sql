-- Mawnytrack · 007 · Caisse propre aux éléments de type « Projet »
-- Appliqué automatiquement au déploiement par scripts/migrate.mjs.

-- Mouvements de la caisse d'un projet :
--   fund : approvisionnement depuis la caisse principale
--   out  : sortie d'argent du projet
--   back : restitution du solde à la caisse principale (clôture)
CREATE TABLE IF NOT EXISTS project_moves (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id  uuid NOT NULL,
  type        text NOT NULL CHECK (type IN ('fund', 'out', 'back')),
  amount      bigint NOT NULL CHECK (amount > 0),
  label       text NOT NULL DEFAULT '' CHECK (length(label) <= 120),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (project_id, user_id) REFERENCES projects (id, user_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS project_moves_user_project_idx ON project_moves (user_id, project_id, occurred_at);
CREATE INDEX IF NOT EXISTS project_moves_user_occurred_idx ON project_moves (user_id, occurred_at);

-- Projet clôturé : lecture seule, solde rendu à la caisse principale
ALTER TABLE projects ADD COLUMN IF NOT EXISTS closed_at timestamptz;

-- Reprise des données : pour les éléments de type Projet, chaque sortie de caisse existante devient un
-- approvisionnement (même montant, libellé et date), puis est retirée de project_disbursements.
-- Le total sorti de la caisse principale est inchangé, donc la caisse principale aussi.
INSERT INTO project_moves (user_id, project_id, type, amount, label, occurred_at, created_at)
SELECT d.user_id, d.project_id, 'fund', d.amount, d.label, d.occurred_at, d.created_at
FROM project_disbursements d
JOIN projects p ON p.id = d.project_id AND p.user_id = d.user_id
WHERE p.kind = 'project';

DELETE FROM project_disbursements d
USING projects p
WHERE p.id = d.project_id AND p.user_id = d.user_id AND p.kind = 'project';

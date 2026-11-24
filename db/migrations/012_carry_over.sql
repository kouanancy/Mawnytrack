-- 012 : report du reste à la clôture d'un mois.
-- À la clôture, l'utilisateur choisit la part du reste du mois reportée en revenu sur le mois suivant ; le reste
-- va dans la caisse.
-- - budget_periods.rest_to_cash : mois clôturé avec la fenêtre de clôture. Sa part de caisse vaut
--   reste du mois − montant reporté (au lieu de l'épargne prévue + le non dépensé des mois clôturés avant).
-- - transactions.carry_period_id : revenu « Reste du mois précédent » (report), daté de l'ouverture du mois suivant
--   et lié au mois clôturé. Il compte dans les revenus et le reste disponible du nouveau mois, jamais comme une
--   nouvelle épargne. Un seul report par mois clôturé.

ALTER TABLE budget_periods ADD COLUMN IF NOT EXISTS rest_to_cash boolean NOT NULL DEFAULT false;

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS carry_period_id uuid;

ALTER TABLE transactions
  ADD CONSTRAINT transactions_carry_period_fk
  FOREIGN KEY (carry_period_id, user_id) REFERENCES budget_periods (id, user_id) ON DELETE CASCADE;

ALTER TABLE transactions
  ADD CONSTRAINT transactions_carry_income_chk
  CHECK (carry_period_id IS NULL OR (kind = 'income' AND line_id IS NULL AND person_id IS NULL));

CREATE UNIQUE INDEX IF NOT EXISTS transactions_carry_uidx ON transactions (carry_period_id) WHERE carry_period_id IS NOT NULL;

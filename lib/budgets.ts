// Budgets (rentrée scolaire, travaux, voyage, fête…) : catégories et lignes (libellé, montant), sans lien avec la
// caisse, le budget mensuel ni les dépenses. Modèle partagé par l'interface et le PDF.

export type BudgetItem = { id: string; label: string; amount: number; position: number };
export type BudgetCategory = { id: string; name: string; position: number; items: BudgetItem[] };
export type Budget = { id: string; name: string; categories: BudgetCategory[] };
export type BudgetSummary = { id: string; name: string; categories: number; items: number; total: number };

/** Catégories et lignes dans l'ordre, sous-totaux, total et nombres. */
export function budgetTotals(b: Budget) {
  const categories = [...b.categories]
    .sort((x, y) => x.position - y.position)
    .map((c) => {
      const items = [...c.items].sort((x, y) => x.position - y.position);
      return { ...c, items, subtotal: items.reduce((a, i) => a + i.amount, 0) };
    });
  return {
    categories,
    total: categories.reduce((a, c) => a + c.subtotal, 0),
    lines: categories.reduce((a, c) => a + c.items.length, 0),
  };
}

/** « Budget-Rentree-scolaire-2026-11-23.pdf » (date du jour), sans accents. */
export function budgetFilename(name: string, day: string) {
  const slug = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `Budget-${slug || "budget"}-${day}.pdf`;
}

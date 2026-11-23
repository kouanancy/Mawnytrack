// Budgets d'événement (« Budget fête », « Anniversaire des 10 ans ») : listes d'articles par catégorie, sans lien
// avec la caisse, le budget mensuel ni les dépenses. Modèle partagé par l'interface et le PDF.

export type EventItem = { id: string; category: string; label: string; amount: number; position: number };
export type EventBudget = {
  id: string;
  name: string;
  /** "YYYY-MM-DD" ou null */
  eventDate: string | null;
  notes: string;
  items: EventItem[];
};
export type EventBudgetSummary = { id: string; name: string; eventDate: string | null; count: number; total: number };

/**
 * Articles regroupés par catégorie, dans l'ordre (position) : une catégorie apparaît à la place de son premier
 * article ; sous-total par catégorie et total.
 */
export function groupItems(items: EventItem[]) {
  const sorted = [...items].sort((a, b) => a.position - b.position);
  const map = new Map<string, EventItem[]>();
  for (const it of sorted) {
    const key = it.category;
    map.set(key, [...(map.get(key) ?? []), it]);
  }
  const groups = [...map.entries()].map(([category, list]) => ({
    category,
    items: list,
    subtotal: list.reduce((a, i) => a + i.amount, 0),
  }));
  return { groups, total: groups.reduce((a, g) => a + g.subtotal, 0), count: items.length };
}

/** « samedi 12 décembre 2026 » */
export function eventDateLabel(day: string) {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d))
    .toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
    .replace(/ 1 /, " 1er ");
}

/** « Budget-Fete-de-Noel-2026-12-24.pdf » (date de l'événement, sinon date du jour), sans accents. */
export function budgetFilename(name: string, day: string) {
  const slug = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `Budget-${slug || "evenement"}-${day}.pdf`;
}

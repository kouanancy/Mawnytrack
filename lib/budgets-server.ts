import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import type { Budget, BudgetSummary } from "@/lib/budgets";

type Row = Record<string, unknown>;
type Rows = { rows: Row[] };
const n = (v: unknown) => (v == null ? 0 : Number(v));

/** Budgets de l'utilisateur avec nombre de catégories, de lignes et total (une requête). */
export function budgetsQuery(userId: string) {
  return db.execute(sql`
    select b.id, b.name,
      (select count(*) from budget_categories c where c.budget_id = b.id and c.user_id = b.user_id) as categories,
      count(i.id) as items, coalesce(sum(i.amount), 0) as total
    from budgets b
    left join budget_categories c on c.budget_id = b.id and c.user_id = b.user_id
    left join budget_items i on i.category_id = c.id and i.user_id = c.user_id
    where b.user_id = ${userId}
    group by b.id
    order by b.created_at`);
}

export const toSummaries = (r: Rows): BudgetSummary[] =>
  r.rows.map((x) => ({ id: String(x.id), name: String(x.name), categories: n(x.categories), items: n(x.items), total: n(x.total) }));

/** Fiche d'un budget : catégories et lignes dans l'ordre, en un seul lot. */
export async function getBudget(userId: string, id: string): Promise<Budget | null> {
  const [budget, cats, items] = (await db.batch([
    db.execute(sql`select id, name from budgets where user_id = ${userId} and id = ${id}`),
    db.execute(sql`
      select id, name, position from budget_categories
      where user_id = ${userId} and budget_id = ${id} order by position, id`),
    db.execute(sql`
      select i.id, i.category_id, i.label, i.amount, i.position
      from budget_items i join budget_categories c on c.id = i.category_id and c.user_id = i.user_id
      where i.user_id = ${userId} and c.budget_id = ${id}
      order by i.position, i.id`),
  ])) as unknown as Rows[];
  const b = budget.rows[0];
  if (!b) return null;
  return {
    id: String(b.id),
    name: String(b.name),
    categories: cats.rows.map((c) => ({
      id: String(c.id),
      name: String(c.name),
      position: n(c.position),
      items: items.rows
        .filter((i) => i.category_id === c.id)
        .map((i) => ({ id: String(i.id), label: String(i.label), amount: n(i.amount), position: n(i.position) })),
    })),
  };
}

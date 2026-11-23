import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import type { EventBudget, EventBudgetSummary } from "@/lib/event-budgets";

type Row = Record<string, unknown>;
type Rows = { rows: Row[] };
const n = (v: unknown) => (v == null ? 0 : Number(v));

/** Budgets d'événement de l'utilisateur, avec nombre d'articles et total prévu (une requête). */
export function eventBudgetsQuery(userId: string) {
  return db.execute(sql`
    select b.id, b.name, to_char(b.event_date, 'YYYY-MM-DD') as event_date,
      count(i.id) as count, coalesce(sum(i.amount), 0) as total
    from event_budgets b
    left join event_budget_items i on i.budget_id = b.id and i.user_id = b.user_id
    where b.user_id = ${userId}
    group by b.id
    order by b.event_date nulls last, b.created_at`);
}

export const toSummaries = (r: Rows): EventBudgetSummary[] =>
  r.rows.map((x) => ({
    id: String(x.id),
    name: String(x.name),
    eventDate: (x.event_date as string) ?? null,
    count: n(x.count),
    total: n(x.total),
  }));

/** Fiche d'un budget d'événement et ses articles, en un seul lot. */
export async function getEventBudget(userId: string, id: string): Promise<EventBudget | null> {
  const [budget, items] = (await db.batch([
    db.execute(sql`
      select id, name, to_char(event_date, 'YYYY-MM-DD') as event_date, notes
      from event_budgets where user_id = ${userId} and id = ${id}`),
    db.execute(sql`
      select id, category, label, amount, position from event_budget_items
      where user_id = ${userId} and budget_id = ${id}
      order by position, id`),
  ])) as unknown as Rows[];
  const b = budget.rows[0];
  if (!b) return null;
  return {
    id: String(b.id),
    name: String(b.name),
    eventDate: (b.event_date as string) ?? null,
    notes: String(b.notes ?? ""),
    items: items.rows.map((r) => ({
      id: String(r.id),
      category: String(r.category),
      label: String(r.label),
      amount: n(r.amount),
      position: n(r.position),
    })),
  };
}

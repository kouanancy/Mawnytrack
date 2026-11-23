"use server";

import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { actionUserId } from "@/lib/session";

// Budgets d'événement : listes indépendantes (aucun lien avec la caisse, le budget mensuel ni les dépenses).
// Toute requête est filtrée par l'utilisateur de la session.

export type BudgetResult = { ok: true; id?: string } | { ok: false; error: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const MAX_AMOUNT = 1_000_000_000_000;
type Row = Record<string, unknown>;
const rowsOf = (r: unknown) => (r as { rows: Row[] }).rows;
const fail = (error: string): BudgetResult => ({ ok: false, error });
const isId = (v: unknown): v is string => typeof v === "string" && UUID_RE.test(v);
const clean = (v: unknown, max: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : "");
const isAmount = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0 && (v as number) <= MAX_AMOUNT;
/** Date facultative : null si vide, false si invalide. */
const dateOf = (v: unknown): string | null | false =>
  v == null || v === "" ? null : typeof v === "string" && DATE_RE.test(v) && !Number.isNaN(Date.parse(v)) ? v : false;

function done(id?: string): BudgetResult {
  revalidatePath("/investissements", "layout");
  return { ok: true, id };
}

export async function createEventBudget(input: { name: string; eventDate?: string | null }): Promise<BudgetResult> {
  const userId = await actionUserId();
  const name = clean(input.name, 80);
  if (!name) return fail("Indiquez un nom.");
  const date = dateOf(input.eventDate);
  if (date === false) return fail("Date invalide.");
  const res = await db.execute(sql`
    insert into event_budgets (user_id, name, event_date) values (${userId}, ${name}, ${date}::date) returning id`);
  return done(String(rowsOf(res)[0].id));
}

/** Nom, date et notes (seuls les champs fournis changent). */
export async function updateEventBudget(input: { id: string; name?: string; eventDate?: string | null; notes?: string }): Promise<BudgetResult> {
  const userId = await actionUserId();
  if (!isId(input.id)) return fail("Budget introuvable.");
  const name = input.name === undefined ? undefined : clean(input.name, 80);
  if (name === "") return fail("Indiquez un nom.");
  const date = input.eventDate === undefined ? undefined : dateOf(input.eventDate);
  if (date === false) return fail("Date invalide.");
  const notes = input.notes === undefined ? undefined : String(input.notes).slice(0, 2000);
  const res = await db.execute(sql`
    update event_budgets set
      name = coalesce(${name ?? null}, name),
      event_date = case when ${date !== undefined} then ${date ?? null}::date else event_date end,
      notes = coalesce(${notes ?? null}, notes)
    where id = ${input.id} and user_id = ${userId} returning id`);
  return rowsOf(res).length ? done(input.id) : fail("Budget introuvable.");
}

export async function deleteEventBudget(id: string): Promise<BudgetResult> {
  const userId = await actionUserId();
  if (!isId(id)) return fail("Budget introuvable.");
  await db.execute(sql`delete from event_budgets where id = ${id} and user_id = ${userId}`);
  return done();
}

/** Copie d'un budget et de ses articles (« [nom] (copie) »), dans une seule instruction. */
export async function duplicateEventBudget(id: string): Promise<BudgetResult> {
  const userId = await actionUserId();
  if (!isId(id)) return fail("Budget introuvable.");
  const res = await db.execute(sql`
    with src as (
      select id, name, event_date, notes from event_budgets where id = ${id} and user_id = ${userId}
    ), nb as (
      insert into event_budgets (user_id, name, event_date, notes)
      select ${userId}, left(name, 72) || ' (copie)', event_date, notes from src
      returning id
    ), items as (
      insert into event_budget_items (budget_id, user_id, category, label, amount, position)
      select nb.id, ${userId}, i.category, i.label, i.amount, i.position
      from nb, event_budget_items i where i.budget_id = ${id} and i.user_id = ${userId}
      returning id
    )
    select id, (select count(*) from items) as items from nb`);
  const r = rowsOf(res)[0];
  return r ? done(String(r.id)) : fail("Budget introuvable.");
}

/* ---------- Articles ---------- */

function checkItem(input: { category: string; label: string; amount: number }) {
  const category = clean(input.category, 60);
  const label = clean(input.label, 120);
  if (!label) return { error: "Indiquez une désignation." };
  if (!category) return { error: "Indiquez une catégorie." };
  if (!isAmount(input.amount)) return { error: "Saisissez un montant." };
  return { category, label, amount: input.amount };
}

/** Ajoute un article en fin de liste. */
export async function addEventItem(input: { budgetId: string; category: string; label: string; amount: number }): Promise<BudgetResult> {
  const userId = await actionUserId();
  if (!isId(input.budgetId)) return fail("Budget introuvable.");
  const c = checkItem(input);
  if ("error" in c) return fail(c.error!);
  const res = await db.execute(sql`
    insert into event_budget_items (budget_id, user_id, category, label, amount, position)
    select b.id, ${userId}, ${c.category}, ${c.label}, ${c.amount}::bigint,
      coalesce((select max(position) from event_budget_items where budget_id = b.id and user_id = ${userId}), 0) + 1
    from event_budgets b where b.id = ${input.budgetId} and b.user_id = ${userId}
    returning id`);
  const r = rowsOf(res)[0];
  return r ? done(String(r.id)) : fail("Budget introuvable.");
}

export async function updateEventItem(input: { id: string; category: string; label: string; amount: number }): Promise<BudgetResult> {
  const userId = await actionUserId();
  if (!isId(input.id)) return fail("Article introuvable.");
  const c = checkItem(input);
  if ("error" in c) return fail(c.error!);
  const res = await db.execute(sql`
    update event_budget_items set category = ${c.category}, label = ${c.label}, amount = ${c.amount}::bigint
    where id = ${input.id} and user_id = ${userId} returning id`);
  return rowsOf(res).length ? done(input.id) : fail("Article introuvable.");
}

export async function deleteEventItem(id: string): Promise<BudgetResult> {
  const userId = await actionUserId();
  if (!isId(id)) return fail("Article introuvable.");
  await db.execute(sql`delete from event_budget_items where id = ${id} and user_id = ${userId}`);
  return done();
}

/** Nouvel ordre des articles (glisser-déposer) : positions 1..n dans l'ordre donné, articles de ce budget seulement. */
export async function reorderEventItems(input: { budgetId: string; ids: string[] }): Promise<BudgetResult> {
  const userId = await actionUserId();
  if (!isId(input.budgetId) || !Array.isArray(input.ids) || input.ids.length > 500 || !input.ids.every(isId))
    return fail("Ordre invalide.");
  if (!input.ids.length) return done();
  const values = sql.join(
    input.ids.map((id, i) => sql`(${id}::uuid, ${i + 1}::int)`),
    sql`, `,
  );
  await db.execute(sql`
    update event_budget_items i set position = v.pos
    from (values ${values}) as v(id, pos)
    where i.id = v.id and i.user_id = ${userId} and i.budget_id = ${input.budgetId}`);
  return done(input.budgetId);
}

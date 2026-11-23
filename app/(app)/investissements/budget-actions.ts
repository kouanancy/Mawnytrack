"use server";

import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { actionUserId } from "@/lib/session";

// Budgets (rentrée scolaire, travaux, voyage, fête…) : catégories et lignes, sans lien avec la caisse, le budget
// mensuel ni les dépenses. Toute requête est filtrée par l'utilisateur de la session.

export type BudgetResult = { ok: true; id?: string } | { ok: false; error: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_AMOUNT = 1_000_000_000_000;
type Row = Record<string, unknown>;
const rowsOf = (r: unknown) => (r as { rows: Row[] }).rows;
const fail = (error: string): BudgetResult => ({ ok: false, error });
const isId = (v: unknown): v is string => typeof v === "string" && UUID_RE.test(v);
const clean = (v: unknown, max: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : "");
const isAmount = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0 && (v as number) <= MAX_AMOUNT;

function done(id?: string): BudgetResult {
  revalidatePath("/investissements", "layout");
  return { ok: true, id };
}

/* ---------- Budgets ---------- */

export async function createBudget(name: string): Promise<BudgetResult> {
  const userId = await actionUserId();
  const n = clean(name, 80);
  if (!n) return fail("Indiquez un nom.");
  const res = await db.execute(sql`insert into budgets (user_id, name) values (${userId}, ${n}) returning id`);
  return done(String(rowsOf(res)[0].id));
}

export async function renameBudget(id: string, name: string): Promise<BudgetResult> {
  const userId = await actionUserId();
  const n = clean(name, 80);
  if (!isId(id)) return fail("Budget introuvable.");
  if (!n) return fail("Indiquez un nom.");
  const res = await db.execute(sql`update budgets set name = ${n} where id = ${id} and user_id = ${userId} returning id`);
  return rowsOf(res).length ? done(id) : fail("Budget introuvable.");
}

export async function deleteBudget(id: string): Promise<BudgetResult> {
  const userId = await actionUserId();
  if (!isId(id)) return fail("Budget introuvable.");
  await db.execute(sql`delete from budgets where id = ${id} and user_id = ${userId}`);
  return done();
}

/** Copie d'un budget, de ses catégories et de ses lignes (« [nom] (copie) »), dans une seule instruction. */
export async function duplicateBudget(id: string): Promise<BudgetResult> {
  const userId = await actionUserId();
  if (!isId(id)) return fail("Budget introuvable.");
  const res = await db.execute(sql`
    with src as (
      select id, name from budgets where id = ${id} and user_id = ${userId}
    ), nb as (
      insert into budgets (user_id, name) select ${userId}, left(name, 72) || ' (copie)' from src returning id
    ), pairs as (
      select c.id as old_id, gen_random_uuid() as new_id, c.name, c.position
      from budget_categories c where c.budget_id = ${id} and c.user_id = ${userId}
    ), nc as (
      insert into budget_categories (id, budget_id, user_id, name, position)
      select p.new_id, nb.id, ${userId}, p.name, p.position from pairs p, nb
      returning id
    ), ni as (
      insert into budget_items (category_id, user_id, label, amount, position)
      select p.new_id, ${userId}, i.label, i.amount, i.position
      from pairs p join budget_items i on i.category_id = p.old_id and i.user_id = ${userId}
      where exists (select 1 from nc where nc.id = p.new_id)
      returning id
    )
    select id, (select count(*) from ni) as items from nb`);
  const r = rowsOf(res)[0];
  return r ? done(String(r.id)) : fail("Budget introuvable.");
}

/* ---------- Catégories ---------- */

/** Nouvelle catégorie en fin de budget. */
export async function addCategory(budgetId: string, name: string): Promise<BudgetResult> {
  const userId = await actionUserId();
  const n = clean(name, 60);
  if (!isId(budgetId)) return fail("Budget introuvable.");
  if (!n) return fail("Indiquez le nom de la catégorie.");
  const res = await db.execute(sql`
    insert into budget_categories (budget_id, user_id, name, position)
    select b.id, ${userId}, ${n},
      coalesce((select max(position) from budget_categories where budget_id = b.id and user_id = ${userId}), 0) + 1
    from budgets b where b.id = ${budgetId} and b.user_id = ${userId}
    returning id`);
  const r = rowsOf(res)[0];
  return r ? done(String(r.id)) : fail("Budget introuvable.");
}

export async function renameCategory(id: string, name: string): Promise<BudgetResult> {
  const userId = await actionUserId();
  const n = clean(name, 60);
  if (!isId(id)) return fail("Catégorie introuvable.");
  if (!n) return fail("Indiquez le nom de la catégorie.");
  const res = await db.execute(sql`update budget_categories set name = ${n} where id = ${id} and user_id = ${userId} returning id`);
  return rowsOf(res).length ? done(id) : fail("Catégorie introuvable.");
}

/** Supprime une catégorie et ses lignes (par cascade). */
export async function deleteCategory(id: string): Promise<BudgetResult> {
  const userId = await actionUserId();
  if (!isId(id)) return fail("Catégorie introuvable.");
  await db.execute(sql`delete from budget_categories where id = ${id} and user_id = ${userId}`);
  return done();
}

/** Positions 1..n dans l'ordre donné (catégories d'un budget, ou lignes d'une catégorie). */
async function reorder(table: "budget_categories" | "budget_items", parent: "budget_id" | "category_id", parentId: string, ids: string[]) {
  const userId = await actionUserId();
  if (!isId(parentId) || !Array.isArray(ids) || ids.length > 500 || !ids.every(isId)) return fail("Ordre invalide.");
  if (!ids.length) return done();
  const values = sql.join(
    ids.map((id, i) => sql`(${id}::uuid, ${i + 1}::int)`),
    sql`, `,
  );
  await db.execute(sql`
    update ${sql.identifier(table)} t set position = v.pos
    from (values ${values}) as v(id, pos)
    where t.id = v.id and t.user_id = ${userId} and t.${sql.identifier(parent)} = ${parentId}`);
  return done(parentId);
}

export async function reorderCategories(budgetId: string, ids: string[]): Promise<BudgetResult> {
  return reorder("budget_categories", "budget_id", budgetId, ids);
}

/* ---------- Lignes ---------- */

/** Nouvelle ligne en fin de catégorie. */
export async function addItem(categoryId: string, label: string, amount: number): Promise<BudgetResult> {
  const userId = await actionUserId();
  const l = clean(label, 120);
  if (!isId(categoryId)) return fail("Catégorie introuvable.");
  if (!l) return fail("Indiquez un libellé.");
  if (!isAmount(amount)) return fail("Saisissez un montant.");
  const res = await db.execute(sql`
    insert into budget_items (category_id, user_id, label, amount, position)
    select c.id, ${userId}, ${l}, ${amount}::bigint,
      coalesce((select max(position) from budget_items where category_id = c.id and user_id = ${userId}), 0) + 1
    from budget_categories c where c.id = ${categoryId} and c.user_id = ${userId}
    returning id`);
  const r = rowsOf(res)[0];
  return r ? done(String(r.id)) : fail("Catégorie introuvable.");
}

export async function updateItem(id: string, label: string, amount: number): Promise<BudgetResult> {
  const userId = await actionUserId();
  const l = clean(label, 120);
  if (!isId(id)) return fail("Ligne introuvable.");
  if (!l) return fail("Indiquez un libellé.");
  if (!isAmount(amount)) return fail("Saisissez un montant.");
  const res = await db.execute(sql`
    update budget_items set label = ${l}, amount = ${amount}::bigint where id = ${id} and user_id = ${userId} returning id`);
  return rowsOf(res).length ? done(id) : fail("Ligne introuvable.");
}

export async function deleteItem(id: string): Promise<BudgetResult> {
  const userId = await actionUserId();
  if (!isId(id)) return fail("Ligne introuvable.");
  await db.execute(sql`delete from budget_items where id = ${id} and user_id = ${userId}`);
  return done();
}

export async function reorderItems(categoryId: string, ids: string[]): Promise<BudgetResult> {
  return reorder("budget_items", "category_id", categoryId, ids);
}

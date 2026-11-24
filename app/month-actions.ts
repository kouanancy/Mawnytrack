"use server";

import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { APP_TZ, addDays, localDayTime, monthLabel, shiftMonth } from "@/lib/month";
import { fmt } from "@/lib/format";
import { CARRY_LABEL, periodRestSql } from "@/lib/period-server";
import { actionUserId } from "@/lib/session";

// Clôture du mois en cours (bouton « Clôturer » de la barre du mois) et son annulation. Une seule transaction par
// action ; les contraintes en base (migrations 008 et 010) garantissent un seul mois ouvert, sans trou ni
// chevauchement.

export type MonthResult = { ok: true; message: string; closed: string; next: string } | { ok: false; error: string };

const KEY_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
type Row = Record<string, unknown>;
const rowsOf = (r: unknown) => (r as { rows: Row[] }).rows;
const fail = (error: string): MonthResult => ({ ok: false, error });
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Reste du mois en cours `key` à ce jour (fenêtre de clôture) ; null si ce n'est pas le mois ouvert. */
export async function closingInfo(key: string): Promise<{ ok: true; rest: number } | { ok: false; error: string }> {
  const userId = await actionUserId();
  if (typeof key !== "string" || !KEY_RE.test(key)) return { ok: false, error: "Mois invalide." };
  const res = await db.execute(sql`
    select ${periodRestSql(userId, sql`bp.start_date`, null)} as rest
    from budget_periods bp
    where bp.user_id = ${userId} and bp.end_date is null and bp.month = (${key + "-01"})::date`);
  const r = rowsOf(res)[0];
  return r ? { ok: true, rest: Number(r.rest) } : { ok: false, error: "Ce mois est déjà clôturé ou n'est pas le mois en cours." };
}

/**
 * Clôture le mois en cours `key` aujourd'hui, en une seule instruction (une transaction) : sa fin est fixée à la
 * date du jour, ses budgets prévus sont figés, le mois suivant s'ouvre le lendemain avec les budgets préparés (ou
 * ceux par défaut des lignes). `carry` (0 à reste du mois) est reporté en revenu « Reste du mois précédent » sur le
 * mois suivant, daté de son ouverture et lié au mois clôturé ; le reste du mois − carry va dans la caisse
 * (rest_to_cash, voir lib/caisse.ts). Une seule clôture par mois : la clé doit être celle du mois ouvert, ouvert au
 * plus tard aujourd'hui.
 */
export async function closeMonth(key: string, carry = 0): Promise<MonthResult> {
  const userId = await actionUserId();
  if (typeof key !== "string" || !KEY_RE.test(key)) return fail("Mois invalide.");
  if (!Number.isSafeInteger(carry) || carry < 0) return fail("Montant à reporter invalide.");
  const today = localDayTime(new Date(), APP_TZ).day;
  const tomorrow = addDays(today, 1);
  const next = shiftMonth(key, 1);
  const res = await db.execute(sql`
    with cur as (
      select id, month, name, start_date from budget_periods
      where user_id = ${userId} and end_date is null and month = (${key + "-01"})::date and start_date <= (${today})::date
      for update
    ), r as (
      select cur.id, ${periodRestSql(userId, sql`cur.start_date`, null)} as rest from cur
    ), ok as (
      -- Montant reporté jamais supérieur au reste du mois (rien n'est reporté si le reste est nul ou négatif)
      select id from r where ${carry}::bigint <= greatest(r.rest, 0)
    ), up as (
      update budget_periods set end_date = (${today})::date, closed_at = now(), rest_to_cash = true
      where id = (select id from ok) returning id
    ), nx as (
      insert into budget_periods (user_id, month, start_date)
      select ${userId}, (${next + "-01"})::date, (${tomorrow})::date from up
      returning id
    ), co as (
      insert into transactions (user_id, kind, amount, label, occurred_at, carry_period_id)
      select ${userId}, 'income', ${carry}::bigint, ${CARRY_LABEL}, (${tomorrow})::timestamp at time zone ${APP_TZ}, up.id
      from up where ${carry}::bigint > 0
      returning id
    ), frozen as (
      -- Budgets prévus du mois clôturé figés (les valeurs déjà figées ou préparées sont gardées)
      insert into monthly_budgets (user_id, line_id, month, planned, period_id)
      select bl.user_id, bl.id, (${key + "-01"})::date, bl.planned, (select id from cur)
      from budget_lines bl, up where bl.user_id = ${userId}
      on conflict (line_id, month) do nothing
      returning id
    ), prepared as (
      -- Budgets préparés pour le mois suivant rattachés à ce mois désormais réel
      update monthly_budgets set period_id = (select id from nx)
      where user_id = ${userId} and month = (${next + "-01"})::date and exists (select 1 from nx)
      returning id
    )
    select (select count(*) from up) as closed, (select name from cur) as name, (select rest from r) as rest,
      (select count(*) from co) as carried,
      (select count(*) from frozen) + (select count(*) from prepared) as touched`);
  const r = rowsOf(res)[0];
  if (!Number(r?.closed)) {
    if (r?.rest != null && carry > 0)
      return fail(`Le montant reporté ne peut pas dépasser le reste du mois (${fmt(Math.max(0, Number(r.rest)))} FCFA).`);
    return fail("Ce mois est déjà clôturé ou n'est pas le mois en cours.");
  }
  revalidatePath("/", "layout");
  const name = cap((r.name as string) || monthLabel(key));
  const toCash = Math.max(0, Number(r.rest) - carry);
  const message =
    carry > 0
      ? `${name} clôturé : ${fmt(toCash)} FCFA dans la caisse, ${fmt(carry)} FCFA reportés en revenu.`
      : `${name} clôturé : ${fmt(toCash)} FCFA dans la caisse.`;
  return { ok: true, closed: key, next, message };
}

/**
 * Annule la clôture (quelques secondes après) : rouvre le mois clôturé `key` et retire le mois suivant, seulement
 * s'il est le mois ouvert et qu'aucun mouvement n'y a encore été saisi. Les budgets figés à la clôture restent.
 */
export async function reopenMonth(key: string): Promise<MonthResult> {
  const userId = await actionUserId();
  if (typeof key !== "string" || !KEY_RE.test(key)) return fail("Mois invalide.");
  const next = shiftMonth(key, 1);
  const res = await db.execute(sql`
    with cl as (
      select id, end_date from budget_periods
      where user_id = ${userId} and month = (${key + "-01"})::date and end_date is not null
    ), nx as (
      select id, start_date from budget_periods
      where user_id = ${userId} and month = (${next + "-01"})::date and end_date is null
        and start_date = (select end_date from cl) + 1
    ), used as (
      select exists (
        select 1 from transactions t, nx
        where t.user_id = ${userId} and (t.occurred_at at time zone ${APP_TZ})::date >= nx.start_date
          and t.carry_period_id is distinct from (select id from cl)
      ) as yes
    ), del as (
      delete from budget_periods where id = (select id from nx) and not (select yes from used) returning id
    ), uncarry as (
      -- Le revenu de report disparaît : la part envoyée dans la caisse en est retirée
      delete from transactions where user_id = ${userId} and carry_period_id = (select id from cl) and exists (select 1 from del)
      returning id
    ), up as (
      update budget_periods set end_date = null, closed_at = null, rest_to_cash = false
      where id = (select id from cl) and exists (select 1 from del) returning id
    )
    select (select count(*) from up) as reopened, (select count(*) from uncarry) as uncarried, (select yes from used) as used, exists (select 1 from nx) as found`);
  const r = rowsOf(res)[0];
  if (Number(r?.reopened)) {
    revalidatePath("/", "layout");
    return { ok: true, closed: key, next, message: `${cap(monthLabel(key))} est rouvert.` };
  }
  if (r?.used) return fail("Des mouvements ont déjà été saisis dans le nouveau mois : la clôture ne peut plus être annulée.");
  return fail("La clôture ne peut plus être annulée.");
}

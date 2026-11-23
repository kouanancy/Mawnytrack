"use server";

import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { APP_TZ, addDays, localDayTime, monthLabel, shiftMonth } from "@/lib/month";
import { longDate } from "@/lib/period";
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

/**
 * Clôture le mois en cours `key` aujourd'hui : sa fin est fixée à la date du jour, ses budgets prévus sont figés,
 * et le mois suivant s'ouvre le lendemain avec les budgets préparés (ou ceux par défaut des lignes). Une seule
 * clôture par mois : la clé doit être celle du mois ouvert, ouvert au plus tard aujourd'hui.
 */
export async function closeMonth(key: string): Promise<MonthResult> {
  const userId = await actionUserId();
  if (typeof key !== "string" || !KEY_RE.test(key)) return fail("Mois invalide.");
  const today = localDayTime(new Date(), APP_TZ).day;
  const tomorrow = addDays(today, 1);
  const next = shiftMonth(key, 1);
  const res = await db.execute(sql`
    with cur as (
      select id, month, name from budget_periods
      where user_id = ${userId} and end_date is null and month = (${key + "-01"})::date and start_date <= (${today})::date
      for update
    ), up as (
      update budget_periods set end_date = (${today})::date, closed_at = now()
      where id = (select id from cur) returning id
    ), nx as (
      insert into budget_periods (user_id, month, start_date)
      select ${userId}, (${next + "-01"})::date, (${tomorrow})::date from up
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
    select (select count(*) from up) as closed, (select name from cur) as name,
      (select count(*) from frozen) + (select count(*) from prepared) as touched`);
  const r = rowsOf(res)[0];
  if (!Number(r?.closed)) return fail("Ce mois est déjà clôturé ou n'est pas le mois en cours.");
  revalidatePath("/", "layout");
  const name = cap((r.name as string) || monthLabel(key));
  const nextName = cap(monthLabel(next));
  return { ok: true, closed: key, next, message: `${name} est clôturé. ${nextName} commence le ${longDate(tomorrow)}.` };
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
      ) as yes
    ), del as (
      delete from budget_periods where id = (select id from nx) and not (select yes from used) returning id
    ), up as (
      update budget_periods set end_date = null, closed_at = null
      where id = (select id from cl) and exists (select 1 from del) returning id
    )
    select (select count(*) from up) as reopened, (select yes from used) as used, exists (select 1 from nx) as found`);
  const r = rowsOf(res)[0];
  if (Number(r?.reopened)) {
    revalidatePath("/", "layout");
    return { ok: true, closed: key, next, message: `${cap(monthLabel(key))} est rouvert.` };
  }
  if (r?.used) return fail("Des mouvements ont déjà été saisis dans le nouveau mois : la clôture ne peut plus être annulée.");
  return fail("La clôture ne peut plus être annulée.");
}

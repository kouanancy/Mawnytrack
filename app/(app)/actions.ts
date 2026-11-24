"use server";

import { and, eq, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { fmt } from "@/lib/format";
import { APP_TZ, isValidMonth, localDayTime } from "@/lib/month";
import { currentPeriod, dayInPeriod, periodName, periodStatus, type PeriodSettings } from "@/lib/period";
import { getPeriodSettings, periodBounds, periodKeySql, periodRestSql } from "@/lib/period-server";
import { actionUserId } from "@/lib/session";

export type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_AMOUNT = 1_000_000_000_000;

const fail = (error: string): ActionResult => ({ ok: false, error });
const isAmount = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) > 0 && (v as number) <= MAX_AMOUNT;
const cleanText = (v: unknown, max: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : "");
type Row = Record<string, unknown>;
const rowsOf = (r: unknown) => (r as { rows: Row[] }).rows;

function done(): ActionResult {
  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Horodatage d'une saisie : maintenant si le mois contient aujourd'hui, sinon son premier jour à l'heure actuelle
 * (mois passé, ou nouveau mois en cours le jour de la clôture du précédent : il s'ouvre le lendemain).
 */
function occurredAt(month: string, ps: PeriodSettings) {
  const day = dayInPeriod(month, ps);
  if (day === localDayTime(new Date(), APP_TZ).day) return sql`now()`;
  return sql`(((${day})::date) + (now() at time zone ${APP_TZ})::time) at time zone ${APP_TZ}`;
}

/** Mois prévu (après le mois en cours) : aucune saisie avant sa clôture. */
function futureError(month: string, ps: PeriodSettings) {
  return periodStatus(month, ps) === "future"
    ? `Ce mois s'ouvrira à la clôture de ${periodName(currentPeriod(ps), ps)}.`
    : null;
}

/* ---------- Dépenses ---------- */

/**
 * Enregistre une dépense sur une ligne. Règle : si la ligne a un budget prévu > 0, le total net
 * du mois ne peut jamais le dépasser. La ligne est verrouillée (FOR UPDATE) puis l'insertion n'a
 * lieu que si le plafond (et, pour un emprunt, le reste à rendre) le permet : le tout dans une
 * seule transaction SQL, ce qui exclut tout dépassement même en cas de saisies simultanées.
 */
export async function addExpense(input: { month: string; amount: number; label: string; lineId: string }): Promise<ActionResult> {
  const userId = await actionUserId();
  const { month, amount, lineId } = input;
  if (!isValidMonth(month)) return fail("Mois invalide.");
  if (!isAmount(amount)) return fail("Saisissez un montant.");
  if (typeof lineId !== "string" || !UUID_RE.test(lineId)) return fail("Choisissez une ligne de budget.");
  const label = cleanText(input.label, 120);
  const ps = await getPeriodSettings(userId);
  const future = futureError(month, ps);
  if (future) return fail(future);
  const { start, lo, hi } = periodBounds(month, ps);

  const [, res] = await db.batch([
    db.execute(sql`select id from budget_lines where id = ${lineId} and user_id = ${userId} for update`),
    db.execute(sql`
      with ln as (
        select bl.id, bl.label, bl.person_id, p.direction, p.name as person_name,
          coalesce(mb.planned, bl.planned) as planned
        from budget_lines bl
        left join people p on p.id = bl.person_id and p.user_id = bl.user_id
        left join monthly_budgets mb on mb.line_id = bl.id and mb.month = (${start})::date
        where bl.id = ${lineId} and bl.user_id = ${userId}
      ), sp as (
        select coalesce(sum(case kind when 'expense' then amount when 'refund' then -amount else 0 end), 0) as spent
        from transactions, ln
        -- Ligne 'lent' : l'accordé (prêts − remboursements) se cumule sur toute la durée
        where user_id = ${userId} and line_id = ${lineId}
          and (ln.direction = 'lent' or (occurred_at >= ${lo} and occurred_at < ${hi}))
      ), du as (
        select coalesce(sum(case t.kind when 'borrow' then t.amount when 'expense' then -t.amount else 0 end), 0) as due
        from transactions t, ln
        where t.user_id = ${userId} and ln.person_id is not null and t.person_id = ln.person_id
      ), ins as (
        insert into transactions (user_id, kind, amount, label, line_id, person_id, occurred_at)
        select ${userId}, 'expense', ${amount}::bigint,
          coalesce(nullif(${label}, ''), case
            when ln.direction = 'borrowed' then 'Remboursement à ' || ln.person_name
            when ln.direction = 'lent' then 'Prêt'
            else ln.label end),
          ln.id, ln.person_id, ${occurredAt(month, ps)}
        from ln, sp, du
        where (ln.planned = 0 or sp.spent + ${amount}::bigint <= ln.planned)
          and (ln.direction is distinct from 'borrowed' or ${amount}::bigint <= du.due)
        returning id
      )
      select ln.label, ln.direction, ln.planned, sp.spent, du.due, (select count(*) from ins) as inserted
      from ln, sp, du`),
  ]);

  const r = rowsOf(res)[0];
  if (!r) return fail("Ligne de budget introuvable.");
  if (Number(r.inserted) > 0) return done();

  const name = String(r.label);
  const planned = Number(r.planned), rest = planned - Number(r.spent), due = Number(r.due);
  if (planned > 0 && rest <= 0)
    return fail(`Budget déjà atteint pour « ${name} ». Aucune nouvelle dépense possible sans modifier le budget prévu.`);
  if (planned > 0 && amount > rest) return fail(`Montant trop élevé : il reste ${fmt(rest)} FCFA sur « ${name} ».`);
  if (r.direction === "borrowed")
    return fail(due <= 0 ? `Aucune somme à rendre à ${name}.` : `Montant supérieur au reste à rendre à ${name} (${fmt(due)} FCFA).`);
  return fail("Enregistrement impossible.");
}

/* ---------- Revenus ---------- */

export async function addIncome(input: { month: string; amount: number; label: string }): Promise<ActionResult> {
  const userId = await actionUserId();
  if (!isValidMonth(input.month)) return fail("Mois invalide.");
  if (!isAmount(input.amount)) return fail("Saisissez un montant.");
  const ps = await getPeriodSettings(userId);
  const future = futureError(input.month, ps);
  if (future) return fail(future);
  await db.insert(schema.transactions).values({
    userId,
    kind: "income",
    amount: input.amount,
    label: cleanText(input.label, 120) || "Revenu",
    occurredAt: occurredAt(input.month, ps),
  });
  return done();
}

/* ---------- Journal ---------- */

export async function deleteTransaction(id: string): Promise<ActionResult> {
  const userId = await actionUserId();
  if (typeof id !== "string" || !UUID_RE.test(id)) return fail("Opération introuvable.");
  await db.delete(schema.transactions).where(and(eq(schema.transactions.id, id), eq(schema.transactions.userId, userId)));
  return done();
}

/**
 * Modifie un revenu ou une dépense de la ligne système « Dépenses non répertoriées » (rapprochement) : montant,
 * libellé, date (même heure locale, jamais dans le futur). Aucun plafond ne s'applique à ces mouvements.
 * Les prêts et emprunts passent par updateMove (app/(app)/prets/actions.ts), les autres dépenses ne se modifient pas.
 */
export async function updateEntry(input: { id: string; amount: number; label: string; date: string }): Promise<ActionResult> {
  const userId = await actionUserId();
  const { id, amount, date } = input;
  if (typeof id !== "string" || !UUID_RE.test(id)) return fail("Opération introuvable.");
  if (!isAmount(amount)) return fail("Saisissez un montant.");
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) return fail("Date invalide.");
  const label = cleanText(input.label, 120);
  const today = localDayTime(new Date(), APP_TZ).day;
  // Report « Reste du mois précédent » : montant seul, au plus le reste du mois clôturé (minimum 0)
  const carryMax = sql`(select greatest(${periodRestSql(userId, sql`cp.start_date`, sql`cp.end_date`)}, 0)
    from budget_periods cp where cp.id = t.carry_period_id and cp.user_id = t.user_id)`;
  const res = await db.execute(sql`
    update transactions t set amount = ${amount}::bigint,
      label = case when t.carry_period_id is null then coalesce(nullif(${label}, ''), t.label) else t.label end,
      occurred_at = case when t.carry_period_id is null
        then ((${date})::date + (t.occurred_at at time zone ${APP_TZ})::time) at time zone ${APP_TZ}
        else t.occurred_at end
    where t.id = ${id} and t.user_id = ${userId} and t.person_id is null
      and (t.carry_period_id is null or ${amount}::bigint <= ${carryMax})
      and (t.kind = 'income'
        or (t.kind = 'expense' and t.line_id in (select id from budget_lines where user_id = ${userId} and system is not null)))
      and ((${date})::date <= (${today})::date or ${date} = to_char(t.occurred_at at time zone ${APP_TZ}, 'YYYY-MM-DD'))
    returning t.id`);
  if (!rowsOf(res).length) {
    const c = rowsOf(
      await db.execute(sql`select ${carryMax} as max from transactions t
        where t.id = ${id} and t.user_id = ${userId} and t.carry_period_id is not null`),
    )[0];
    if (c) return fail(`Montant trop élevé : au plus ${fmt(Number(c.max))} FCFA, reste du mois clôturé.`);
    return fail(date > today ? "La date ne peut pas être dans le futur." : "Modification impossible.");
  }
  return done();
}

/* ---------- Budget ---------- */

export async function addLine(input: { label: string; planned: number }): Promise<ActionResult> {
  const userId = await actionUserId();
  const label = cleanText(input.label, 80);
  if (!label) return fail("Indiquez un nom de ligne.");
  const planned = input.planned === 0 ? 0 : input.planned;
  if (planned !== 0 && !isAmount(planned)) return fail("Budget prévu invalide.");
  const res = await db.execute(sql`
    insert into budget_lines (user_id, label, planned, position)
    select ${userId}, ${label}, ${planned}::bigint, coalesce(max(position), 0) + 1
    from budget_lines where user_id = ${userId}
    returning id`);
  revalidatePath("/", "layout");
  // Identifiant renvoyé : la ligne créée depuis la saisie des dépenses est aussitôt choisie
  return { ok: true, id: String(rowsOf(res)[0].id) };
}

/** Retire une ligne ; ses dépenses restent dans le journal (line_id passe à NULL). */
export async function deleteLine(id: string): Promise<ActionResult> {
  const userId = await actionUserId();
  if (typeof id !== "string" || !UUID_RE.test(id)) return fail("Ligne introuvable.");
  // Les lignes de personnes (volet Prêts) ne se retirent pas depuis le Budget.
  // Ni les lignes de personnes ni la ligne système « Dépenses non répertoriées »
  await db
    .delete(schema.budgetLines)
    .where(
      and(
        eq(schema.budgetLines.id, id),
        eq(schema.budgetLines.userId, userId),
        isNull(schema.budgetLines.personId),
        isNull(schema.budgetLines.system),
      ),
    );
  return done();
}

/**
 * Modifie le budget prévu d'une ligne pour le mois affiché.
 * - Mois budgétaire terminé : valeur figée de cette période (monthly_budgets).
 * - Mois en cours ou à venir : budget par défaut (budget_lines.planned), qui vaut pour toutes les périodes non figées.
 * Le nouveau montant ne peut pas être inférieur au dépensé des mois concernés (0 = pas de plafond).
 */
export async function setPlanned(input: { lineId: string; month: string; planned: number }): Promise<ActionResult> {
  const userId = await actionUserId();
  const { lineId, month, planned } = input;
  if (typeof lineId !== "string" || !UUID_RE.test(lineId)) return fail("Ligne introuvable.");
  if (!isValidMonth(month)) return fail("Mois invalide.");
  if (planned !== 0 && !isAmount(planned)) return fail("Budget prévu invalide.");
  const lock = db.execute(sql`select id from budget_lines where id = ${lineId} and user_id = ${userId} for update`);
  // Ligne système « Dépenses non répertoriées » : budget prévu toujours 0 (sans plafond)
  const [sys] = await db
    .select({ system: schema.budgetLines.system })
    .from(schema.budgetLines)
    .where(and(eq(schema.budgetLines.id, lineId), eq(schema.budgetLines.userId, userId)));
  if (sys?.system) return fail("Cette ligne n'a pas de budget prévu : elle reste sans plafond.");
  const net = sql`sum(case kind when 'expense' then amount when 'refund' then -amount else 0 end)`;

  const ps = await getPeriodSettings(userId);
  const current = currentPeriod(ps);
  let res;
  if (month < current) {
    const { start, lo, hi } = periodBounds(month, ps);
    [, res] = await db.batch([
      lock,
      db.execute(sql`
        with ln as (select id, label from budget_lines where id = ${lineId} and user_id = ${userId}),
        al as (
          -- Ligne 'lent' : l'accordé se cumule sur toute la durée (0 pour les autres lignes)
          select coalesce(sum(case t.kind when 'expense' then t.amount when 'refund' then -t.amount else 0 end), 0) as spent,
            bool_or(true) as lent
          from transactions t
          join budget_lines bl on bl.id = t.line_id and bl.user_id = t.user_id
          join people p on p.id = bl.person_id and p.user_id = bl.user_id and p.direction = 'lent'
          where t.user_id = ${userId} and t.line_id = ${lineId}
        ), sp as (
          select coalesce(${net}, 0) as spent from transactions
          where user_id = ${userId} and line_id = ${lineId} and occurred_at >= ${lo} and occurred_at < ${hi}
        ), up as (
          insert into monthly_budgets (user_id, line_id, month, planned, period_id)
          select ${userId}, ln.id, (${start})::date, ${planned}::bigint,
            (select bp.id from budget_periods bp where bp.user_id = ${userId} and bp.month = (${start})::date)
          from ln, sp, al
          where ${planned}::bigint = 0 or ${planned}::bigint >= greatest(sp.spent, al.spent)
          on conflict (line_id, month) do update set planned = excluded.planned
          returning id
        )
        select ln.label, greatest(sp.spent, al.spent) as spent, coalesce(al.lent, false) as lent,
          (select count(*) from up) as updated
        from ln, sp, al`),
    ]);
  } else if (month > current) {
    // Mois prévu : budget préparé pour ce mois seul (gardé à sa clôture du mois en cours) ; aucune dépense possible
    // d'ici là, seul l'accordé d'une ligne de prêt compte.
    [, res] = await db.batch([
      lock,
      db.execute(sql`
        with ln as (select id, label from budget_lines where id = ${lineId} and user_id = ${userId}),
        al as (
          select coalesce(sum(case t.kind when 'expense' then t.amount when 'refund' then -t.amount else 0 end), 0) as spent,
            bool_or(true) as lent
          from transactions t
          join budget_lines bl on bl.id = t.line_id and bl.user_id = t.user_id
          join people p on p.id = bl.person_id and p.user_id = bl.user_id and p.direction = 'lent'
          where t.user_id = ${userId} and t.line_id = ${lineId}
        ), up as (
          insert into monthly_budgets (user_id, line_id, month, planned)
          select ${userId}, ln.id, (${month + "-01"})::date, ${planned}::bigint from ln, al
          where ${planned}::bigint = 0 or ${planned}::bigint >= al.spent
          on conflict (line_id, month) do update set planned = excluded.planned
          returning id
        )
        select ln.label, al.spent, coalesce(al.lent, false) as lent, (select count(*) from up) as updated
        from ln, al`),
    ]);
  } else {
    // Mois en cours : budget par défaut de la ligne (et valeur préparée pour ce mois, s'il y en a une)
    const { lo } = periodBounds(current, ps);
    [, res] = await db.batch([
      lock,
      db.execute(sql`
        with ln as (select id, label from budget_lines where id = ${lineId} and user_id = ${userId}),
        al as (
          -- Ligne 'lent' : l'accordé se cumule sur toute la durée (0 pour les autres lignes)
          select coalesce(sum(case t.kind when 'expense' then t.amount when 'refund' then -t.amount else 0 end), 0) as spent,
            bool_or(true) as lent
          from transactions t
          join budget_lines bl on bl.id = t.line_id and bl.user_id = t.user_id
          join people p on p.id = bl.person_id and p.user_id = bl.user_id and p.direction = 'lent'
          where t.user_id = ${userId} and t.line_id = ${lineId}
        ), sp as (
          select coalesce(max(x.spent), 0) as spent from (
            select ${periodKeySql(sql`occurred_at`, ps)} as m, ${net} as spent
            from transactions
            where user_id = ${userId} and line_id = ${lineId} and occurred_at >= ${lo}
            group by 1
          ) x
        ), up as (
          update budget_lines set planned = ${planned}::bigint
          where id = ${lineId} and user_id = ${userId}
            and (${planned}::bigint = 0 or ${planned}::bigint >= (select greatest(sp.spent, al.spent) from sp, al))
          returning id
        ), prepared as (
          update monthly_budgets set planned = ${planned}::bigint
          where line_id = ${lineId} and user_id = ${userId} and month = (${current + "-01"})::date
            and exists (select 1 from up)
          returning id
        )
        select ln.label, greatest(sp.spent, al.spent) as spent, coalesce(al.lent, false) as lent,
          (select count(*) from up) as updated
        from ln, sp, al`),
    ]);
  }

  const r = rowsOf(res)[0];
  if (!r) return fail("Ligne introuvable.");
  if (Number(r.updated) > 0) return done();
  return fail(
    `Le budget de « ${r.label} » ne peut pas être inférieur aux ${fmt(Number(r.spent))} FCFA déjà ${r.lent ? "accordés" : "dépensés"}.`,
  );
}

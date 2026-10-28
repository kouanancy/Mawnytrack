"use server";

import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { fmt } from "@/lib/format";
import { checkMove } from "@/lib/ledger";
import { APP_TZ, localDayTime } from "@/lib/month";
import { currentPeriod, periodTitle } from "@/lib/period";
import { getPeriodSettings, periodKeySql } from "@/lib/period-server";
import { actionUserId } from "@/lib/session";

// Actions du volet Prêts. Tout est écrit dans transactions (aucune donnée en double) ; les personnes
// et leurs lignes de budget (budget_lines.person_id) sont créées ici. Filtrage systématique par user_id.

export type LoanResult = { ok: true; personId?: string } | { ok: false; error: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const MAX_AMOUNT = 1_000_000_000_000;
type Row = Record<string, unknown>;
const rowsOf = (r: unknown) => (r as { rows: Row[] }).rows;
const fail = (error: string): LoanResult => ({ ok: false, error });
const isAmount = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) > 0 && (v as number) <= MAX_AMOUNT;
const clean = (v: unknown, max: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : "");

function done(personId?: string): LoanResult {
  revalidatePath("/", "layout");
  return { ok: true, personId };
}

/** Horodatage d'un mouvement daté : maintenant si la date est aujourd'hui, sinon ce jour-là à l'heure actuelle. */
function occurredOn(date: string | null) {
  const today = localDayTime(new Date(), APP_TZ).day;
  if (!date || date === today) return sql`now()`;
  return sql`(((${date})::date) + (now() at time zone ${APP_TZ})::time) at time zone ${APP_TZ}`;
}

function checkDate(date: unknown): string | null {
  if (date == null || date === "") return null;
  if (typeof date !== "string" || !DATE_RE.test(date) || Number.isNaN(Date.parse(date))) return "Date invalide.";
  if (date > localDayTime(new Date(), APP_TZ).day) return "La date ne peut pas être dans le futur.";
  return null;
}

/** Position de la prochaine ligne de budget. */
const nextPosition = (userId: string) =>
  sql`coalesce((select max(position) from budget_lines where user_id = ${userId}), 0) + 1`;

/**
 * Argent prêté : ajoute une personne (nom seul) et crée sa ligne de budget, en une seule instruction.
 * Les prêts se saisissent ensuite côté Dépenses, sur cette ligne.
 */
export async function addLentPerson(name: string): Promise<LoanResult> {
  const userId = await actionUserId();
  const n = clean(name, 80);
  if (!n) return fail("Indiquez un nom.");
  const res = await db.execute(sql`
    with p as (
      insert into people (user_id, name, direction) values (${userId}, ${n}, 'lent')
      on conflict do nothing
      returning id, name
    ), l as (
      insert into budget_lines (user_id, label, planned, person_id, position)
      select ${userId}, p.name, 0, p.id, ${nextPosition(userId)} from p
      returning person_id
    )
    select person_id from l`);
  const r = rowsOf(res)[0];
  if (!r) return fail(`« ${n} » figure déjà dans la liste.`);
  return done(String(r.person_id));
}

/**
 * Argent emprunté : enregistre un emprunt reçu (transaction borrow). Le prêteur est désigné par son
 * identifiant (fiche) ou par son nom (nouvel emprunt) ; s'il n'existe pas encore, la personne et sa
 * ligne « Remboursements d'emprunts » sont créées dans la même instruction.
 */
export async function addBorrow(input: {
  personId?: string;
  name?: string;
  amount: number;
  label?: string;
  date?: string | null;
}): Promise<LoanResult> {
  const userId = await actionUserId();
  if (!isAmount(input.amount)) return fail("Saisissez un montant.");
  const dateErr = checkDate(input.date);
  if (dateErr) return fail(dateErr);
  const label = clean(input.label, 120) || "Emprunt";
  const occ = occurredOn(input.date || null);

  if (input.personId) {
    if (!UUID_RE.test(input.personId)) return fail("Personne introuvable.");
    const res = await db.execute(sql`
      insert into transactions (user_id, kind, amount, label, person_id, occurred_at)
      select ${userId}, 'borrow', ${input.amount}::bigint, ${label}, p.id, ${occ}
      from people p where p.id = ${input.personId} and p.user_id = ${userId} and p.direction = 'borrowed'
      returning person_id`);
    const r = rowsOf(res)[0];
    return r ? done(String(r.person_id)) : fail("Personne introuvable.");
  }

  const name = clean(input.name, 80);
  if (!name) return fail("Indiquez le nom du prêteur.");
  try {
    const res = await db.execute(sql`
      with found as (
        select id from people
        where user_id = ${userId} and direction = 'borrowed' and lower(btrim(name)) = lower(${name})
      ), created as (
        insert into people (user_id, name, direction)
        select ${userId}, ${name}, 'borrowed' where not exists (select 1 from found)
        returning id
      ), pid as (
        select id from found union all select id from created
      ), line as (
        insert into budget_lines (user_id, label, planned, person_id, position)
        select ${userId}, ${name}, 0, pid.id, ${nextPosition(userId)} from pid
        on conflict do nothing
        returning id
      ), ins as (
        insert into transactions (user_id, kind, amount, label, person_id, occurred_at)
        select ${userId}, 'borrow', ${input.amount}::bigint, ${label}, pid.id, ${occ} from pid
        returning person_id
      )
      select person_id, (select count(*) from line) as new_line from ins`);
    const r = rowsOf(res)[0];
    return r ? done(String(r.person_id)) : fail("Enregistrement impossible. Réessayez.");
  } catch {
    return fail("Enregistrement impossible. Réessayez.");
  }
}

/**
 * Argent prêté : remboursement reçu (transaction refund sur la ligne de la personne), limité au reste dû.
 * La personne est verrouillée (FOR UPDATE) pour que deux remboursements simultanés ne dépassent jamais le dû.
 */
export async function addRefund(input: { personId: string; amount: number; date?: string | null }): Promise<LoanResult> {
  const userId = await actionUserId();
  const { personId, amount } = input;
  if (typeof personId !== "string" || !UUID_RE.test(personId)) return fail("Personne introuvable.");
  if (!isAmount(amount)) return fail("Saisissez un montant.");
  const dateErr = checkDate(input.date);
  if (dateErr) return fail(dateErr);

  const [, res] = await db.batch([
    db.execute(sql`select id from people where id = ${personId} and user_id = ${userId} for update`),
    db.execute(sql`
      with p as (
        select p.id, p.name, bl.id as line_id
        from people p
        left join budget_lines bl on bl.person_id = p.id and bl.user_id = p.user_id
        where p.id = ${personId} and p.user_id = ${userId} and p.direction = 'lent'
      ), d as (
        select coalesce(sum(case kind when 'expense' then amount when 'refund' then -amount else 0 end), 0) as due
        from transactions where user_id = ${userId} and person_id = ${personId}
      ), ins as (
        insert into transactions (user_id, kind, amount, label, line_id, person_id, occurred_at)
        select ${userId}, 'refund', ${amount}::bigint, 'Remboursement de ' || p.name, p.line_id, p.id, ${occurredOn(input.date || null)}
        from p, d where ${amount}::bigint <= d.due
        returning id
      )
      select p.name, d.due, (select count(*) from ins) as inserted from p, d`),
  ]);
  const r = rowsOf(res)[0];
  if (!r) return fail("Personne introuvable.");
  if (Number(r.inserted) > 0) return done(personId);
  const due = Math.max(0, Number(r.due));
  return fail(due <= 0 ? `Aucune somme due par ${r.name}.` : `Montant supérieur au reste dû par ${r.name} (${fmt(due)} FCFA).`);
}

/**
 * Modifie un mouvement lié à une personne (montant, libellé, date) : prêt accordé, remboursement reçu,
 * emprunt reçu ou remboursement d'emprunt. La transaction elle-même est modifiée (source unique de vérité).
 * Contrôles, dans une transaction SQL sous verrou (ligne puis personne, FOR UPDATE), avec les mêmes règles que
 * l'interface (checkMove) ; une modification qui n'aggrave pas la situation reste possible :
 * - remboursements jamais supérieurs aux prêts ou emprunts de la personne ;
 * - personne 'lent' : accordé (prêts − remboursements) jamais au-dessus du budget prévu de sa ligne ;
 * - remboursement d'emprunt : jamais au-dessus du budget de la ligne pour la période de la nouvelle date.
 */
export async function updateMove(input: { id: string; amount: number; label: string; date: string }): Promise<LoanResult> {
  const userId = await actionUserId();
  const { id, amount, date } = input;
  if (typeof id !== "string" || !UUID_RE.test(id)) return fail("Opération introuvable.");
  if (!isAmount(amount)) return fail("Saisissez un montant.");
  if (typeof date !== "string" || !DATE_RE.test(date) || Number.isNaN(Date.parse(date))) return fail("Date invalide.");
  const label = clean(input.label, 120);
  const today = localDayTime(new Date(), APP_TZ).day;
  const ps = await getPeriodSettings(userId);
  // monthly_budgets.month = 1er jour du mois de la clé de période
  const curStart = `${currentPeriod(ps)}-01`;
  const net = sql`case x.kind when 'expense' then x.amount when 'refund' then -x.amount else 0 end`;

  const [, , res] = await db.batch([
    db.execute(sql`
      select id from budget_lines
      where user_id = ${userId} and id = (select line_id from transactions where id = ${id} and user_id = ${userId})
      for update`),
    db.execute(sql`
      select id from people
      where user_id = ${userId} and id = (select person_id from transactions where id = ${id} and user_id = ${userId})
      for update`),
    db.execute(sql`
      with t as (
        select t.id, t.kind, t.amount, t.line_id, t.person_id, t.occurred_at, p.direction, p.name,
          (p.direction = 'lent' and t.kind = 'expense') or (p.direction = 'borrowed' and t.kind = 'borrow') as is_loan,
          to_char(t.occurred_at at time zone ${APP_TZ}, 'YYYY-MM-DD') as old_day
        from transactions t join people p on p.id = t.person_id and p.user_id = t.user_id
        where t.id = ${id} and t.user_id = ${userId}
          and ((p.direction = 'lent' and t.kind in ('expense', 'refund'))
            or (p.direction = 'borrowed' and t.kind in ('borrow', 'expense')))
      ), nw as (
        -- Nouvelle date, même heure locale qu'avant
        select ((${date})::date + (t.occurred_at at time zone ${APP_TZ})::time) at time zone ${APP_TZ} as at from t
      ), agg as (
        select
          coalesce(sum(x.amount) filter (where (t.direction = 'lent' and x.kind = 'expense') or (t.direction = 'borrowed' and x.kind = 'borrow')), 0) as loans,
          coalesce(sum(x.amount) filter (where (t.direction = 'lent' and x.kind = 'refund') or (t.direction = 'borrowed' and x.kind = 'expense')), 0) as pays
        from t join transactions x on x.user_id = ${userId} and x.person_id = t.person_id
      ), pk as (
        select ${periodKeySql(sql`nw.at`, ps)} as m, ${periodKeySql(sql`t.occurred_at`, ps)} as old_m from t, nw
      ), c as (
        select
          t.*, agg.loans, agg.pays, pk.m, pk.old_m,
          agg.loans + case when t.is_loan then ${amount}::bigint - t.amount else 0 end as new_loans,
          agg.pays + case when t.is_loan then 0 else ${amount}::bigint - t.amount end as new_pays,
          -- Personne 'lent' : budget prévu de la ligne (période en cours)
          coalesce(
            (select mb.planned from monthly_budgets mb where mb.line_id = t.line_id and mb.month = (${curStart})::date),
            (select bl.planned from budget_lines bl where bl.id = t.line_id and bl.user_id = ${userId}), 0) as planned,
          -- Remboursement d'emprunt : budget et dépensé de la ligne sur la période de la nouvelle date
          coalesce(
            (select mb.planned from monthly_budgets mb where mb.line_id = t.line_id and mb.month = pk.m),
            (select bl.planned from budget_lines bl where bl.id = t.line_id and bl.user_id = ${userId}), 0) as p_planned,
          (select coalesce(sum(${net}), 0) from transactions x
            where x.user_id = ${userId} and x.line_id = t.line_id and x.id <> t.id
              and ${periodKeySql(sql`x.occurred_at`, ps)} = pk.m) as p_spent
        from t, agg, pk
      ), up as (
        update transactions tr set amount = ${amount}::bigint, occurred_at = nw.at,
          label = coalesce(nullif(${label}, ''), case
            when c.direction = 'lent' and c.kind = 'expense' then 'Prêt'
            when c.direction = 'lent' then 'Remboursement de ' || c.name
            when c.kind = 'borrow' then 'Emprunt'
            else 'Remboursement à ' || c.name end)
        from c, nw
        where tr.id = c.id and tr.user_id = ${userId}
          and ((${date})::date <= (${today})::date or ${date} = c.old_day)
          and (c.new_pays <= c.new_loans or c.new_pays - c.new_loans <= c.pays - c.loans)
          and (c.direction <> 'lent' or c.planned = 0 or c.new_loans - c.new_pays <= c.planned
            or c.new_loans - c.new_pays <= c.loans - c.pays)
          and (c.direction <> 'borrowed' or c.kind <> 'expense' or c.p_planned = 0
            or c.p_spent + ${amount}::bigint <= c.p_planned or (c.m = c.old_m and ${amount}::bigint <= c.amount))
        returning tr.id
      )
      select c.person_id, c.direction, c.name, c.is_loan, c.amount, c.loans, c.pays, c.planned, c.p_planned, c.p_spent,
        c.old_day, to_char(c.m, 'YYYY-MM') as m, c.m = c.old_m as same, (select count(*) from up) as updated
      from c`),
  ]);

  const r = rowsOf(res)[0];
  if (!r) return fail("Opération introuvable.");
  if (Number(r.updated) > 0) return done(String(r.person_id));
  if (date > today && date !== r.old_day) return fail("La date ne peut pas être dans le futur.");
  const check = checkMove(
    {
      direction: r.direction as "lent" | "borrowed",
      name: String(r.name),
      isLoan: r.is_loan === true,
      old: Number(r.amount),
      loans: Number(r.loans),
      pays: Number(r.pays),
      planned: Number(r.planned),
      period: { planned: Number(r.p_planned), spent: Number(r.p_spent), same: r.same === true, title: periodTitle(String(r.m), ps) },
    },
    amount,
  );
  return fail(check.ok ? "Modification impossible. Réessayez." : check.hint);
}

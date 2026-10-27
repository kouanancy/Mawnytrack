"use server";

import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { fmt } from "@/lib/format";
import { APP_TZ, localDayTime } from "@/lib/month";
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

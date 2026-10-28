import "server-only";
import { sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { APP_TZ } from "@/lib/month";
import { currentPeriod, type PeriodSettings } from "@/lib/period";
import { getPeriodSettings, periodBounds } from "@/lib/period-server";

// Toutes les lectures d'un écran partent en un seul lot (db.batch = un aller-retour HTTP,
// une transaction), avec les agrégats calculés en SQL. Chaque requête filtre sur user_id.

export type Direction = "lent" | "borrowed";
export type Kind = "income" | "expense" | "refund" | "borrow";

export type Line = {
  id: string;
  label: string;
  personId: string | null;
  direction: Direction | null;
  /** Budget prévu du mois (0 = pas de plafond) */
  planned: number;
  /** Dépensé net du mois (dépenses − remboursements reçus) ; ligne 'lent' : accordé sur toute la durée */
  spent: number;
  expense: number;
  refund: number;
  /** Personne liée : somme due (prêt) ou reste à rendre (emprunt), tous mois confondus */
  due: number;
  /** Personne liée, tous mois confondus : total prêté ou emprunté, et total remboursé */
  loans: number;
  pays: number;
};

export type Entry = {
  id: string;
  kind: Kind;
  amount: number;
  label: string;
  lineId: string | null;
  lineLabel: string | null;
  direction: Direction | null;
  personId: string | null;
  personName: string | null;
  /** Jour local "YYYY-MM-DD" et heure "HH:MM" dans le fuseau de l'application */
  day: string;
  time: string;
  at: string;
};

export type Totals = { income: number; borrow: number; expense: number; refund: number };

export type MonthData = {
  lines: Line[];
  totals: Totals;
  entries: Entry[];
  /** Dettes en cours : total restant à rendre aux personnes 'borrowed' (affiché à l'étape 2) */
  debts: number;
};

const n = (v: unknown) => (v == null ? 0 : Number(v));

/** Fige les budgets d'une période terminée (idempotent : seules les lignes non encore figées sont ajoutées). */
function freezeMonth(userId: string, start: string) {
  return db.execute(sql`
    insert into monthly_budgets (user_id, line_id, month, planned)
    select user_id, id, (${start})::date, planned from budget_lines where user_id = ${userId}
    on conflict (line_id, month) do nothing`);
}

function linesQuery(userId: string, month: string, ps: PeriodSettings) {
  const { start, lo, hi } = periodBounds(month, ps);
  return db.execute(sql`
    with s as (
      select line_id,
        sum(case kind when 'expense' then amount when 'refund' then -amount else 0 end) as spent,
        coalesce(sum(amount) filter (where kind = 'expense'), 0) as expense,
        coalesce(sum(amount) filter (where kind = 'refund'), 0) as refund
      from transactions
      where user_id = ${userId} and line_id is not null and occurred_at >= ${lo} and occurred_at < ${hi}
      group by line_id
    ), a as (
      -- Lignes de personnes 'lent' : accordé calculé sur toute la durée (prêts − remboursements)
      select t.line_id,
        sum(case t.kind when 'expense' then t.amount when 'refund' then -t.amount else 0 end) as spent,
        coalesce(sum(t.amount) filter (where t.kind = 'expense'), 0) as expense,
        coalesce(sum(t.amount) filter (where t.kind = 'refund'), 0) as refund
      from transactions t
      join budget_lines bl on bl.id = t.line_id and bl.user_id = t.user_id
      join people p on p.id = bl.person_id and p.user_id = bl.user_id and p.direction = 'lent'
      where t.user_id = ${userId}
      group by t.line_id
    ), d as (
      select t.person_id,
        coalesce(sum(t.amount) filter (where (p.direction = 'lent' and t.kind = 'expense') or (p.direction = 'borrowed' and t.kind = 'borrow')), 0) as loans,
        coalesce(sum(t.amount) filter (where (p.direction = 'lent' and t.kind = 'refund') or (p.direction = 'borrowed' and t.kind = 'expense')), 0) as pays,
        sum(case
          when p.direction = 'lent' and t.kind = 'expense' then t.amount
          when p.direction = 'lent' and t.kind = 'refund' then -t.amount
          when p.direction = 'borrowed' and t.kind = 'borrow' then t.amount
          when p.direction = 'borrowed' and t.kind = 'expense' then -t.amount
          else 0 end) as due
      from transactions t join people p on p.id = t.person_id and p.user_id = t.user_id
      where t.user_id = ${userId}
      group by t.person_id
    )
    select bl.id, bl.label, bl.person_id, p.direction,
      coalesce(mb.planned, bl.planned) as planned,
      case when p.direction = 'lent' then greatest(coalesce(a.spent, 0), 0) else greatest(coalesce(s.spent, 0), 0) end as spent,
      case when p.direction = 'lent' then coalesce(a.expense, 0) else coalesce(s.expense, 0) end as expense,
      case when p.direction = 'lent' then coalesce(a.refund, 0) else coalesce(s.refund, 0) end as refund,
      greatest(coalesce(d.due, 0), 0) as due, coalesce(d.loans, 0) as loans, coalesce(d.pays, 0) as pays
    from budget_lines bl
    left join people p on p.id = bl.person_id and p.user_id = bl.user_id
    left join monthly_budgets mb on mb.line_id = bl.id and mb.month = (${start})::date
    left join s on s.line_id = bl.id
    left join a on a.line_id = bl.id
    left join d on d.person_id = bl.person_id
    where bl.user_id = ${userId}
    order by bl.position, bl.created_at`);
}

function totalsQuery(userId: string, month: string, ps: PeriodSettings) {
  const { lo, hi } = periodBounds(month, ps);
  return db.execute(sql`
    select
      coalesce(sum(amount) filter (where kind = 'income'), 0) as income,
      coalesce(sum(amount) filter (where kind = 'borrow'), 0) as borrow,
      coalesce(sum(amount) filter (where kind = 'expense'), 0) as expense,
      coalesce(sum(amount) filter (where kind = 'refund'), 0) as refund
    from transactions
    where user_id = ${userId} and occurred_at >= ${lo} and occurred_at < ${hi}`);
}

function entriesQuery(userId: string, month: string, kinds: Kind[], ps: PeriodSettings) {
  const { lo, hi } = periodBounds(month, ps);
  const kindList: SQL = sql.join(kinds.map((k) => sql`${k}`), sql`, `);
  return db.execute(sql`
    select t.id, t.kind, t.amount, t.label, t.line_id, bl.label as line_label, p.direction, t.person_id, p.name as person_name,
      to_char(t.occurred_at at time zone ${APP_TZ}, 'YYYY-MM-DD') as day,
      to_char(t.occurred_at at time zone ${APP_TZ}, 'HH24:MI') as time,
      t.occurred_at as at
    from transactions t
    left join budget_lines bl on bl.id = t.line_id and bl.user_id = t.user_id
    left join people p on p.id = t.person_id and p.user_id = t.user_id
    where t.user_id = ${userId} and t.kind in (${kindList})
      and t.occurred_at >= ${lo} and t.occurred_at < ${hi}
    order by t.occurred_at desc, t.created_at desc`);
}

function debtsQuery(userId: string) {
  return db.execute(sql`
    select coalesce(sum(greatest(due, 0)), 0) as debts from (
      select sum(case t.kind when 'borrow' then t.amount when 'expense' then -t.amount else 0 end) as due
      from people p join transactions t on t.person_id = p.id and t.user_id = p.user_id
      where p.user_id = ${userId} and p.direction = 'borrowed'
      group by p.id
    ) x`);
}

type Rows = { rows: Record<string, unknown>[] };

function toLine(r: Record<string, unknown>): Line {
  return {
    id: String(r.id),
    label: String(r.label),
    personId: (r.person_id as string) ?? null,
    direction: (r.direction as Direction) ?? null,
    planned: n(r.planned),
    spent: n(r.spent),
    expense: n(r.expense),
    refund: n(r.refund),
    due: n(r.due),
    loans: n(r.loans),
    pays: n(r.pays),
  };
}

function toEntry(r: Record<string, unknown>): Entry {
  return {
    id: String(r.id),
    kind: r.kind as Kind,
    amount: n(r.amount),
    label: String(r.label ?? ""),
    lineId: (r.line_id as string) ?? null,
    lineLabel: (r.line_label as string) ?? null,
    direction: (r.direction as Direction) ?? null,
    personId: (r.person_id as string) ?? null,
    personName: (r.person_name as string) ?? null,
    day: String(r.day),
    time: String(r.time),
    at: new Date(r.at as string).toISOString(),
  };
}

/**
 * Données d'un mois budgétaire (période, voir lib/period.ts) pour un écran. journal : types de transactions
 * listés (aucun pour le Budget). Une période terminée est figée dans monthly_budgets dans le même lot.
 */
export async function getMonthData(userId: string, month: string, journal: Kind[]): Promise<MonthData> {
  const ps = await getPeriodSettings(userId);
  const past = month < currentPeriod(ps);
  const reads = [
    linesQuery(userId, month, ps),
    totalsQuery(userId, month, ps),
    debtsQuery(userId),
    ...(journal.length ? [entriesQuery(userId, month, journal, ps)] : []),
  ] as const;
  const results = (past
    ? await db.batch([freezeMonth(userId, `${month}-01`), ...reads])
    : await db.batch([...reads])) as unknown as Rows[];
  const [lines, totals, debts, entries] = past ? results.slice(1) : results;

  const t = totals.rows[0] ?? {};
  return {
    lines: lines.rows.map(toLine),
    totals: { income: n(t.income), borrow: n(t.borrow), expense: n(t.expense), refund: n(t.refund) },
    debts: n(debts.rows[0]?.debts),
    entries: entries ? entries.rows.map(toEntry) : [],
  };
}

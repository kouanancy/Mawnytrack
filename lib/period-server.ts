import "server-only";
import { sql, type SQL } from "drizzle-orm";
import { cache } from "react";
import { db } from "@/lib/db";
import { APP_TZ, addDays, localDayTime, shiftMonth } from "@/lib/month";
import { keyForOpening, openPeriod, periodDates, type PeriodSettings, type StoredPeriod } from "@/lib/period";

type Row = Record<string, unknown>;

/** Libellé de la ligne système de rapprochement (une par utilisateur, budget_lines.system = 'unlisted'). */
export const UNLISTED_LABEL = "Dépenses non répertoriées";

const periodsQuery = (userId: string) =>
  db.execute(sql`
    select id, to_char(month, 'YYYY-MM') as key, name, to_char(start_date, 'YYYY-MM-DD') as start,
      to_char(end_date, 'YYYY-MM-DD') as "end", closed_at is not null as closed
    from budget_periods where user_id = ${userId} order by start_date`);

const toPeriod = (r: Row): StoredPeriod => ({
  id: String(r.id),
  key: String(r.key),
  name: (r.name as string) ?? null,
  start: String(r.start),
  end: (r.end as string) ?? null,
  closed: r.closed === true,
});

/**
 * Mois enregistrés (une lecture par requête). Garantit au passage :
 * - un mois en cours ouvert : nouvel utilisateur ou « Tout réinitialiser » → mois ouvert aujourd'hui (nom selon
 *   l'ouverture : le 15 ou après → mois suivant) ; dernier mois clôturé sans successeur → mois suivant ouvert le
 *   lendemain de sa clôture ;
 * - la ligne système « Dépenses non répertoriées ».
 */
export const getPeriodSettings = cache(async (userId: string): Promise<PeriodSettings> => {
  const [periods, sys] = (await db.batch([
    periodsQuery(userId),
    db.execute(sql`select exists (select 1 from budget_lines where user_id = ${userId} and system = 'unlisted') as ok`),
  ])) as unknown as { rows: Row[] }[];
  let list = periods.rows.map(toPeriod);

  const last = list[list.length - 1];
  const today = localDayTime(new Date(), APP_TZ).day;
  const open = !last
    ? { key: keyForOpening(today), start: today }
    : last.end !== null
      ? { key: shiftMonth(last.key, 1), start: addDays(last.end, 1) }
      : null;
  const writes = [
    ...(open
      ? [
          db.execute(sql`
            insert into budget_periods (user_id, month, start_date)
            values (${userId}, (${open.key + "-01"})::date, (${open.start})::date)
            on conflict (user_id) where end_date is null do nothing`),
        ]
      : []),
    ...(sys.rows[0]?.ok
      ? []
      : [
          db.execute(sql`
            insert into budget_lines (user_id, label, planned, position, system)
            select ${userId}, ${UNLISTED_LABEL}, 0, coalesce(max(position), 0) + 1, 'unlisted'
            from budget_lines where user_id = ${userId}
            on conflict (user_id) where system is not null do nothing`),
        ]),
  ];
  if (writes.length) {
    const res = (await db.batch([...writes, periodsQuery(userId)] as unknown as Parameters<typeof db.batch>[0])) as unknown as {
      rows: Row[];
    }[];
    list = res[res.length - 1].rows.map(toPeriod);
  }
  return { periods: list };
});

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/** Date littérale validée (les dates viennent de la base ou du calcul, jamais du client). */
const lit = (d: string) => {
  if (!DATE_RE.test(d)) throw new Error("Date invalide");
  return sql.raw(`'${d}'::date`);
};

/**
 * Bornes SQL [lo, hi[ d'un mois dans le fuseau de l'application (sans borne haute pour le mois en cours, ouvert),
 * et sa clé sous forme de date (`start`, 1er jour du mois de la clé) pour monthly_budgets.month.
 */
export function periodBounds(key: string, s: PeriodSettings) {
  const { start, end } = periodDates(key, s);
  return {
    start: `${key}-01`,
    lo: sql`(${lit(start)})::timestamp at time zone ${APP_TZ}`,
    hi: end === null ? sql`'infinity'::timestamptz` : sql`(${lit(addDays(end, 1))})::timestamp at time zone ${APP_TZ}`,
  };
}

/** Clé du mois en cours sous forme de date SQL (1er jour du mois de la clé). */
export const currentKeySql = (s: PeriodSettings) => {
  const o = openPeriod(s);
  return o ? lit(`${o.key}-01`) : sql`date_trunc('month', (now() at time zone ${APP_TZ})::date)::date`;
};

/**
 * Clé (1er jour du mois de la clé, type date) du mois contenant un instant, calculée en SQL : même règle que
 * periodOf. Mois enregistrés : leurs dates (CASE) ; à partir de l'ouverture du mois en cours : le mois en cours ;
 * avant le premier mois : de mois en mois, même jour du mois que son ouverture (intervalles de mois bornés comme
 * addMonths).
 */
export function periodKeySql(col: SQL, s: PeriodSettings): SQL {
  const day = sql`(${col} at time zone ${APP_TZ})::date`;
  const first = s.periods[0], last = openPeriod(s);
  if (!first || !last) return sql`date_trunc('month', ${day})::date`;
  const fs = lit(first.start);
  const fk = lit(`${first.key}-01`);
  // Écart en mois entre l'ouverture du premier mois et le jour, puis ajustement selon le jour du mois
  const k = sql`((extract(year from ${fs})::int * 12 + extract(month from ${fs})::int) - (extract(year from ${day})::int * 12 + extract(month from ${day})::int))`;
  const n = sql`(case when ${k} >= 1 and (${fs} - make_interval(months => ${k}))::date <= ${day} then ${k} else ${k} + 1 end)`;
  const closed = s.periods.filter((p) => p.end !== null).map((p) => sql`when ${day} <= ${lit(p.end!)} then ${lit(`${p.key}-01`)}`);
  return sql`(case
    when ${day} < ${fs} then (${fk} - make_interval(months => ${n}))::date
    ${sql.join(closed, sql` `)}
    else ${lit(`${last.key}-01`)}
  end)`;
}

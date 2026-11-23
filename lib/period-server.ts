import "server-only";
import { sql, type SQL } from "drizzle-orm";
import { cache } from "react";
import { db } from "@/lib/db";
import { APP_TZ, addDays, localDayTime, shiftMonth } from "@/lib/month";
import {
  chainEdges,
  chainEnd,
  defaultEnd,
  defaultKeyOf,
  defaultStart,
  periodDates,
  type PeriodNaming,
  type PeriodSettings,
  type StoredPeriod,
} from "@/lib/period";

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
  end: String(r.end),
  closed: r.closed === true,
});

/**
 * Réglage du mois budgétaire et périodes enregistrées (une lecture par requête). Garantit au passage :
 * - des périodes jusqu'à aujourd'hui : sans action, une nouvelle période s'ouvre le lendemain de la clôture de
 *   la précédente, jusqu'à la date proposée par le réglage par défaut (chainEnd) ;
 * - la ligne système « Dépenses non répertoriées ».
 */
export const getPeriodSettings = cache(async (userId: string): Promise<PeriodSettings> => {
  const [settings, periods, sys] = (await db.batch([
    db.execute(sql`select start_day, period_naming from user_settings where user_id = ${userId}`),
    periodsQuery(userId),
    db.execute(sql`select exists (select 1 from budget_lines where user_id = ${userId} and system = 'unlisted') as ok`),
  ])) as unknown as { rows: Row[] }[];
  const st = settings.rows[0];
  const base = {
    startDay: st ? Number(st.start_day) : 1,
    naming: ((st?.period_naming as PeriodNaming) ?? "end") as PeriodNaming,
  };
  let list = periods.rows.map(toPeriod);

  const today = localDayTime(new Date(), APP_TZ).day;
  const missing: { key: string; start: string; end: string }[] = [];
  if (!list.length) {
    const key = defaultKeyOf(today, base);
    missing.push({ key, start: defaultStart(key, base), end: defaultEnd(key, base) });
  } else {
    let last = list[list.length - 1];
    while (last.end < today && missing.length < 240) {
      const start = addDays(last.end, 1);
      const next = { key: shiftMonth(last.key, 1), start, end: chainEnd(start, base) };
      missing.push(next);
      last = { ...last, ...next };
    }
  }
  const writes = [
    ...missing.map((p) =>
      db.execute(sql`
        insert into budget_periods (user_id, month, start_date, end_date)
        values (${userId}, (${p.key + "-01"})::date, (${p.start})::date, (${p.end})::date)
        on conflict (user_id, month) do nothing`),
    ),
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
  return { ...base, periods: list };
});

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/** Date littérale validée (les dates viennent de la base ou du calcul, jamais du client). */
const lit = (d: string) => {
  if (!DATE_RE.test(d)) throw new Error("Date invalide");
  return sql.raw(`'${d}'::date`);
};

/**
 * Bornes SQL [lo, hi[ d'une période dans le fuseau de l'application, et sa clé sous forme de date
 * (`start`, 1er jour du mois de la clé) pour monthly_budgets.month.
 */
export function periodBounds(key: string, s: PeriodSettings) {
  const { start, end } = periodDates(key, s);
  return {
    start: `${key}-01`,
    lo: sql`(${lit(start)})::timestamp at time zone ${APP_TZ}`,
    hi: sql`(${lit(addDays(end, 1))})::timestamp at time zone ${APP_TZ}`,
  };
}

/**
 * Clé (1er jour du mois de la clé, type date) de la période contenant un instant, calculée en SQL : même règle
 * que periodOf. Périodes enregistrées : leurs dates (CASE) ; avant la première ou après la dernière : prolongement
 * de la chaîne (période voisine, puis réglage par défaut : mois de la date « startDay » + écart constant).
 */
export function periodKeySql(col: SQL, s: PeriodSettings): SQL {
  // Entiers validés (1 à 28) écrits en littéraux : pas d'ambiguïté de type sur « paramètre × interval »
  const back = sql.raw(String(Math.trunc(Number(s.startDay)) - 1));
  const day = sql`(${col} at time zone ${APP_TZ})::date`;
  const sdMonth = sql`date_trunc('month', ${day} - ${back})`;
  const plus = (n: number) => sql.raw(`interval '${Math.trunc(n)} month'`);
  const keyLit = (k: string) => lit(`${k}-01`);
  if (!s.periods.length) {
    const shift = s.naming === "end" && s.startDay > 1 ? 1 : 0;
    return sql`(${sdMonth} + ${plus(shift)})::date`;
  }
  const e = chainEdges(s);
  const branches = s.periods.map((p) => sql`when ${day} <= ${lit(p.end)} then ${keyLit(p.key)}`);
  return sql`(case
    when ${day} < ${lit(e.prev.start)} then (${sdMonth} + ${plus(e.beforeShift)})::date
    when ${day} < ${lit(e.first.start)} then ${keyLit(e.prev.key)}
    ${sql.join(branches, sql` `)}
    when ${day} <= ${lit(e.next.end)} then ${keyLit(e.next.key)}
    else (${sdMonth} + ${plus(e.afterShift)})::date
  end)`;
}

import "server-only";
import { eq, sql, type SQL } from "drizzle-orm";
import { cache } from "react";
import { db, schema } from "@/lib/db";
import { APP_TZ } from "@/lib/month";
import { DEFAULT_PERIOD, periodStart, type PeriodSettings } from "@/lib/period";

/** Réglage du mois budgétaire de l'utilisateur (une lecture par requête). */
export const getPeriodSettings = cache(async (userId: string): Promise<PeriodSettings> => {
  const [row] = await db
    .select({ startDay: schema.userSettings.startDay, naming: schema.userSettings.periodNaming })
    .from(schema.userSettings)
    .where(eq(schema.userSettings.userId, userId));
  return row ? { startDay: row.startDay, naming: row.naming } : DEFAULT_PERIOD;
});

/**
 * Bornes SQL [lo, hi[ d'une période dans le fuseau de l'application, et sa clé sous forme de date
 * (`start`, 1er jour du mois de la clé) pour monthly_budgets.month.
 */
export function periodBounds(key: string, s: PeriodSettings) {
  const first = periodStart(key, s);
  return {
    start: `${key}-01`,
    lo: sql`((${first})::date)::timestamp at time zone ${APP_TZ}`,
    hi: sql`(((${first})::date) + interval '1 month')::timestamp at time zone ${APP_TZ}`,
  };
}

/**
 * Clé (1er jour du mois de la clé, type date) de la période contenant un instant, calculée en SQL :
 * même règle que periodOf. Le jour local recule de (startDay − 1) jours pour retrouver le mois de début.
 */
export function periodKeySql(col: SQL, s: PeriodSettings): SQL {
  const shift = s.naming === "end" && s.startDay > 1 ? 1 : 0;
  // Entiers validés (1 à 28, 0 ou 1) écrits en littéraux : pas d'ambiguïté de type sur « paramètre × interval »
  const back = sql.raw(String(Math.trunc(Number(s.startDay)) - 1));
  return sql`(date_trunc('month', (${col} at time zone ${APP_TZ})::date - ${back}) + interval '${sql.raw(String(shift))} month')::date`;
}

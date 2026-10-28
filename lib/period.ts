// Mois budgétaire : un « mois » de Mawnytrack est une période qui commence le jour `startDay` (1 à 28) et
// finit la veille du même jour le mois suivant. Elle est identifiée par une clé "YYYY-MM" : le mois où elle
// se termine (naming "end", par défaut) ou celui où elle commence ("start"). Avec startDay = 1, la période
// est le mois du calendrier, quel que soit le nom choisi.
// Seule source de calcul des périodes, côté client comme côté serveur (voir aussi lib/period-server.ts).
import { APP_TZ, addDays, localDayTime, monthLabel, shiftMonth } from "@/lib/month";

export type PeriodNaming = "end" | "start";
export type PeriodSettings = { startDay: number; naming: PeriodNaming };
export const DEFAULT_PERIOD: PeriodSettings = { startDay: 1, naming: "end" };

export const isStartDay = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 28;

const pad = (n: number) => String(n).padStart(2, "0");

/** Décalage (en mois) entre la clé de la période et le mois où elle commence. */
const offset = (s: PeriodSettings) => (s.naming === "end" && s.startDay > 1 ? 1 : 0);

/** Premier jour de la période "YYYY-MM-DD". */
export function periodStart(key: string, s: PeriodSettings): string {
  return `${shiftMonth(key, -offset(s))}-${pad(s.startDay)}`;
}

/** Dernier jour (inclus) de la période. */
export function periodEnd(key: string, s: PeriodSettings): string {
  return addDays(`${shiftMonth(periodStart(key, s).slice(0, 7), 1)}-${pad(s.startDay)}`, -1);
}

/** Clé de la période qui contient ce jour. */
export function periodOf(day: string, s: PeriodSettings): string {
  const startMonth = Number(day.slice(8, 10)) >= s.startDay ? day.slice(0, 7) : shiftMonth(day.slice(0, 7), -1);
  return shiftMonth(startMonth, offset(s));
}

/** Période en cours (contient la date du jour dans le fuseau de l'application). */
export function currentPeriod(s: PeriodSettings, tz: string = APP_TZ): string {
  return periodOf(localDayTime(new Date(), tz).day, s);
}

/** « 1er » pour le premier jour du mois, comme en français courant. */
const first = (s: string) => s.replace(/^1 /, "1er ");
const shortDay = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return first(new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" }));
};
const longDate = (day: string, year = true) => {
  const [y, m, d] = day.split("-").map(Number);
  return first(
    new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "long",
      ...(year ? { year: "numeric" as const } : {}),
      timeZone: "UTC",
    }),
  );
};

/** « 22 oct. – 21 nov. » */
export function periodRange(key: string, s: PeriodSettings): string {
  return `${shortDay(periodStart(key, s))} – ${shortDay(periodEnd(key, s))}`;
}

/** « novembre 2026 » (nom de la période). */
export const periodName = (key: string) => monthLabel(key);

/** « du 22 octobre au 21 novembre 2026 » */
export function periodSpan(key: string, s: PeriodSettings): string {
  const a = periodStart(key, s), b = periodEnd(key, s);
  return `du ${longDate(a, a.slice(0, 4) !== b.slice(0, 4))} au ${longDate(b)}`;
}

/** Titre avec les dates quand le mois ne suit pas le calendrier : « novembre 2026 (22 oct. – 21 nov.) ». */
export function periodTitle(key: string, s: PeriodSettings): string {
  return s.startDay === 1 ? periodName(key) : `${periodName(key)} (${periodRange(key, s)})`;
}

/** Date d'une saisie dans une période : aujourd'hui si la période est en cours, sinon son premier jour. */
export function dayInPeriod(key: string, s: PeriodSettings, tz: string = APP_TZ): string {
  const today = localDayTime(new Date(), tz).day;
  return today >= periodStart(key, s) && today <= periodEnd(key, s) ? today : periodStart(key, s);
}

/** Clé de période lue dans l'URL (?m=YYYY-MM), sinon la période en cours. */
export function parsePeriod(v: string | string[] | undefined, s: PeriodSettings): string {
  return typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v) ? v : currentPeriod(s);
}

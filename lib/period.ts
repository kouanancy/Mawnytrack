// Mois budgétaire : un « mois » de Mawnytrack est une période enregistrée dans budget_periods (migrations 008 et
// 010). Les mois se suivent sans trou ni chevauchement (l'ouverture d'un mois est le lendemain de la clôture du
// précédent). Le dernier, le mois en cours, est ouvert (pas de date de fin) jusqu'à ce que l'utilisateur le
// clôture ; la clôture fixe sa fin au jour même et ouvre le mois suivant le lendemain.
// Chaque mois a une clé "YYYY-MM" (URL ?m=, monthly_budgets.month) ; les clés se suivent de mois en mois et le nom
// affiché est celui de la clé (ou un nom enregistré).
// Autour des mois enregistrés :
// - mois prévus (après le mois en cours) : ouverture provisoire le même jour du mois que l'ouverture du mois en
//   cours, n mois plus tard ; on y prépare le budget, sans saisie ;
// - avant le premier mois : prolongement de mois en mois (même règle, vers le passé).
// Seule source de calcul des périodes, côté client comme côté serveur (voir aussi lib/period-server.ts).
import { APP_TZ, addDays, localDayTime, monthLabel, shiftMonth } from "@/lib/month";

/** Mois enregistré : clé "YYYY-MM", nom (null = mois de la clé), dates "YYYY-MM-DD" incluses ; end null = ouvert. */
export type StoredPeriod = { id: string; key: string; name: string | null; start: string; end: string | null; closed: boolean };
/** Mois enregistrés, du plus ancien au plus récent ; le dernier est le mois en cours (ouvert). */
export type PeriodSettings = { periods: StoredPeriod[] };
export const DEFAULT_PERIOD: PeriodSettings = { periods: [] };

const pad = (n: number) => String(n).padStart(2, "0");
/** Nombre de mois de b à a ("YYYY-MM"). */
export const monthDiff = (a: string, b: string) =>
  (Number(a.slice(0, 4)) - Number(b.slice(0, 4))) * 12 + (Number(a.slice(5, 7)) - Number(b.slice(5, 7)));
const lastDay = (month: string) => Number(addDays(`${shiftMonth(month, 1)}-01`, -1).slice(8, 10));
/** Même jour du mois, n mois plus tard (borné au dernier jour du mois : 31 → 30 avril). */
export function addMonths(day: string, n: number) {
  const m = shiftMonth(day.slice(0, 7), n);
  return `${m}-${pad(Math.min(Number(day.slice(8, 10)), lastDay(m)))}`;
}

/**
 * Clé d'un mois qui s'ouvre ce jour-là quand rien ne le précède : ouverture le 15 ou après → mois suivant
 * (ouvert le 24 novembre → « décembre 2026 »), sinon mois de l'ouverture.
 */
export const keyForOpening = (day: string) => (Number(day.slice(8, 10)) >= 15 ? shiftMonth(day.slice(0, 7), 1) : day.slice(0, 7));

/** Mois en cours (ouvert), dernier mois enregistré. */
export const openPeriod = (s: PeriodSettings) => s.periods[s.periods.length - 1] ?? null;

/**
 * Dates d'un mois : enregistrées (end null pour le mois en cours), prévues après le mois en cours (ouverture
 * provisoire, fin la veille de l'ouverture provisoire suivante), ou prolongées avant le premier mois.
 */
export function periodDates(key: string, s: PeriodSettings): { start: string; end: string | null } {
  const found = s.periods.find((p) => p.key === key);
  if (found) return found;
  const first = s.periods[0], last = openPeriod(s);
  if (!first || !last) {
    // Aucun mois enregistré (cas transitoire) : mois du calendrier
    return { start: `${key}-01`, end: addDays(`${shiftMonth(key, 1)}-01`, -1) };
  }
  if (key > last.key) {
    const n = monthDiff(key, last.key);
    return { start: addMonths(last.start, n), end: addDays(addMonths(last.start, n + 1), -1) };
  }
  const n = monthDiff(first.key, key);
  const start = addMonths(first.start, -n);
  const end = n === 1 ? addDays(first.start, -1) : addDays(addMonths(first.start, -n + 1), -1);
  return { start, end };
}

/** Premier jour du mois "YYYY-MM-DD" (provisoire pour un mois prévu). */
export const periodStart = (key: string, s: PeriodSettings) => periodDates(key, s).start;
/** Dernier jour (inclus) ; null pour le mois en cours, encore ouvert. */
export const periodEnd = (key: string, s: PeriodSettings) => periodDates(key, s).end;

/**
 * Clé du mois qui contient ce jour (même règle que periodKeySql côté SQL). Tout jour à partir de l'ouverture du
 * mois en cours lui appartient : tant qu'il est ouvert, toute nouvelle saisie lui revient.
 */
export function periodOf(day: string, s: PeriodSettings): string {
  const first = s.periods[0], last = openPeriod(s);
  if (!first || !last) return day.slice(0, 7);
  if (day >= last.start) return last.key;
  if (day < first.start) {
    // Avant le premier mois : de mois en mois, même jour du mois que son ouverture
    let n = 1;
    while (day < addMonths(first.start, -n) && n < 1200) n++;
    return shiftMonth(first.key, -n);
  }
  return s.periods.find((p) => day >= p.start && (p.end === null || day <= p.end))!.key;
}

/** Mois en cours : le mois ouvert (même le jour de la clôture du précédent, avant l'ouverture du suivant). */
export function currentPeriod(s: PeriodSettings, tz: string = APP_TZ): string {
  return openPeriod(s)?.key ?? localDayTime(new Date(), tz).day.slice(0, 7);
}

/** État d'un mois : clôturé (ou antérieur), en cours, ou prévu. */
export function periodStatus(key: string, s: PeriodSettings): "past" | "current" | "future" {
  const cur = currentPeriod(s);
  return key < cur ? "past" : key === cur ? "current" : "future";
}

/** Mois enregistré de cette clé, s'il y en a un. */
export const storedPeriod = (key: string, s: PeriodSettings) => s.periods.find((p) => p.key === key) ?? null;

/** « 1er » pour le premier jour du mois, comme en français courant. */
const first = (t: string) => t.replace(/^1 /, "1er ");
export const shortDay = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return first(new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" }));
};
export const longDate = (day: string, year = true) => {
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

/** Le mois couvre exactement le mois du calendrier de sa clé (du 1er au dernier jour). */
export function isCalendarPeriod(key: string, s: PeriodSettings) {
  const { start, end } = periodDates(key, s);
  return start === `${key}-01` && end === addDays(`${shiftMonth(key, 1)}-01`, -1);
}

/** Dates sous le nom : « 22 oct. – 21 nov. », « depuis le 24 oct. · en cours » ou « prévu à partir du 22 nov. ». */
export function periodRange(key: string, s: PeriodSettings): string {
  const { start, end } = periodDates(key, s);
  const st = periodStatus(key, s);
  if (st === "current") return `depuis le ${shortDay(start)} · en cours`;
  if (st === "future") return `prévu à partir du ${shortDay(start)}`;
  return `${shortDay(start)} – ${shortDay(end ?? start)}`;
}

/** « novembre 2026 » : nom enregistré du mois, sinon le mois de sa clé. */
export const periodName = (key: string, s?: PeriodSettings) => (s && storedPeriod(key, s)?.name) || monthLabel(key);

/** « novembre 2026 (22 oct. – 21 nov.) », « décembre 2026 (depuis le 22 nov. · en cours) » ; dates omises pour un mois du calendrier. */
export function periodTitle(key: string, s: PeriodSettings): string {
  return isCalendarPeriod(key, s) ? periodName(key, s) : `${periodName(key, s)} (${periodRange(key, s)})`;
}

/** Date d'une saisie dans un mois : aujourd'hui si le mois le contient, sinon son premier jour. */
export function dayInPeriod(key: string, s: PeriodSettings, tz: string = APP_TZ): string {
  const today = localDayTime(new Date(), tz).day;
  const { start, end } = periodDates(key, s);
  return today >= start && (end === null || today <= end) ? today : start;
}

/** Clé de mois lue dans l'URL (?m=YYYY-MM), sinon le mois en cours. */
export function parsePeriod(v: string | string[] | undefined, s: PeriodSettings): string {
  return typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v) ? v : currentPeriod(s);
}

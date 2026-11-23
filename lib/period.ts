// Mois budgétaire : un « mois » de Mawnytrack est une période enregistrée dans budget_periods (migration 008) :
// dates d'ouverture et de clôture au choix, sans trou ni chevauchement (l'ouverture d'une période est le
// lendemain de la clôture de la précédente). Chaque période a une clé "YYYY-MM" (URL ?m=, monthly_budgets.month)
// et les clés se suivent de mois en mois ; son nom est modifiable (par défaut, le mois de la clé).
// Le réglage `startDay` (1 à 28) et `naming` ne servent qu'à proposer les dates des nouvelles périodes et à
// prolonger la chaîne avant la première ou après la dernière période enregistrée.
// Seule source de calcul des périodes, côté client comme côté serveur (voir aussi lib/period-server.ts).
import { APP_TZ, addDays, localDayTime, monthLabel, shiftMonth } from "@/lib/month";

export type PeriodNaming = "end" | "start";
/** Période enregistrée : clé "YYYY-MM", nom (null = nom par défaut), dates "YYYY-MM-DD" incluses. */
export type StoredPeriod = { id: string; key: string; name: string | null; start: string; end: string; closed: boolean };
/** Réglage par défaut et périodes enregistrées, triées de la plus ancienne à la plus récente. */
export type PeriodSettings = { startDay: number; naming: PeriodNaming; periods: StoredPeriod[] };
export const DEFAULT_PERIOD: PeriodSettings = { startDay: 1, naming: "end", periods: [] };

export const isStartDay = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 28;

const pad = (n: number) => String(n).padStart(2, "0");
/** Nombre de mois de b à a ("YYYY-MM"). */
export const monthDiff = (a: string, b: string) =>
  (Number(a.slice(0, 4)) - Number(b.slice(0, 4))) * 12 + (Number(a.slice(5, 7)) - Number(b.slice(5, 7)));

/* ---------- Règle par défaut (réglage « Le mois commence le ») ---------- */

/** Décalage (en mois) entre la clé par défaut et le mois où la période commence. */
const offset = (s: Pick<PeriodSettings, "startDay" | "naming">) => (s.naming === "end" && s.startDay > 1 ? 1 : 0);
/** Date « startDay » d'un mois "YYYY-MM". */
const sdDate = (month: string, s: Pick<PeriodSettings, "startDay">) => `${month}-${pad(s.startDay)}`;
/** Mois de la date « startDay » qui précède ou égale ce jour. */
const sdMonth = (day: string, s: Pick<PeriodSettings, "startDay">) =>
  Number(day.slice(8, 10)) >= s.startDay ? day.slice(0, 7) : shiftMonth(day.slice(0, 7), -1);

/** Ouverture par défaut de la période de clé `key`. */
export const defaultStart = (key: string, s: Pick<PeriodSettings, "startDay" | "naming">) => sdDate(shiftMonth(key, -offset(s)), s);
/** Clôture par défaut (veille de l'ouverture par défaut suivante). */
export const defaultEnd = (key: string, s: Pick<PeriodSettings, "startDay" | "naming">) =>
  addDays(sdDate(shiftMonth(key, 1 - offset(s)), s), -1);
/** Clé par défaut de la période qui contient ce jour. */
export const defaultKeyOf = (day: string, s: Pick<PeriodSettings, "startDay" | "naming">) => shiftMonth(sdMonth(day, s), offset(s));

/**
 * Clôture proposée pour une période qui s'ouvre le `start` : veille de la première date « startDay » au moins
 * 15 jours plus tard (ex. début le 22, ouverture le 20 novembre → clôture le 21 décembre).
 */
export function chainEnd(start: string, s: Pick<PeriodSettings, "startDay">) {
  const t = addDays(start, 15);
  let c = sdDate(t.slice(0, 7), s);
  if (c < t) c = sdDate(shiftMonth(t.slice(0, 7), 1), s);
  return addDays(c, -1);
}
/** Ouverture proposée pour une période qui se clôt le `end` (symétrique de chainEnd). */
export function chainStart(end: string, s: Pick<PeriodSettings, "startDay">) {
  const t = addDays(end, -15);
  let c = sdDate(t.slice(0, 7), s);
  if (c > t) c = sdDate(shiftMonth(t.slice(0, 7), -1), s);
  return c;
}

/**
 * Prolongement de la chaîne hors des périodes enregistrées : la période qui suit la dernière s'ouvre le lendemain
 * de sa clôture (clôture chainEnd), puis les suivantes suivent le réglage par défaut ; de même avant la première.
 * Renvoie aussi l'écart constant clé − mois « startDay » au-delà (utilisé par la requête SQL, même règle).
 */
export function chainEdges(s: PeriodSettings) {
  const ps = s.periods;
  const first = ps[0], last = ps[ps.length - 1];
  const nextStart = addDays(last.end, 1);
  const nextEnd = chainEnd(nextStart, s);
  const prevEnd = addDays(first.start, -1);
  const prevStart = chainStart(prevEnd, s);
  return {
    first,
    last,
    next: { key: shiftMonth(last.key, 1), start: nextStart, end: nextEnd },
    prev: { key: shiftMonth(first.key, -1), start: prevStart, end: prevEnd },
    /** Au-delà de next : clé = mois « startDay » + afterShift mois */
    afterShift: monthDiff(shiftMonth(last.key, 2), addDays(nextEnd, 1).slice(0, 7)),
    /** Avant prev : clé = mois « startDay » + beforeShift mois */
    beforeShift: monthDiff(shiftMonth(first.key, -2), shiftMonth(prevStart.slice(0, 7), -1)),
  };
}

/* ---------- Périodes (enregistrées ou prolongées) ---------- */

/** Dates de la période de clé `key` : enregistrées, ou prolongement par défaut de la chaîne. */
export function periodDates(key: string, s: PeriodSettings): { start: string; end: string } {
  if (!s.periods.length) return { start: defaultStart(key, s), end: defaultEnd(key, s) };
  const found = s.periods.find((p) => p.key === key);
  if (found) return found;
  const e = chainEdges(s);
  if (key > e.last.key) {
    if (key === e.next.key) return e.next;
    // Période régulière : ouverture le « startDay » du mois (clé − afterShift)
    const m = shiftMonth(key, -e.afterShift);
    return { start: sdDate(m, s), end: addDays(sdDate(shiftMonth(m, 1), s), -1) };
  }
  if (key === e.prev.key) return e.prev;
  const m = shiftMonth(key, -e.beforeShift);
  return { start: sdDate(m, s), end: addDays(sdDate(shiftMonth(m, 1), s), -1) };
}

/** Premier jour de la période "YYYY-MM-DD". */
export const periodStart = (key: string, s: PeriodSettings) => periodDates(key, s).start;
/** Dernier jour (inclus) de la période. */
export const periodEnd = (key: string, s: PeriodSettings) => periodDates(key, s).end;

/** Clé de la période qui contient ce jour (même règle que periodKeySql côté SQL). */
export function periodOf(day: string, s: PeriodSettings): string {
  if (!s.periods.length) return defaultKeyOf(day, s);
  const e = chainEdges(s);
  if (day > e.last.end) {
    if (day <= e.next.end) return e.next.key;
    return shiftMonth(sdMonth(day, s), e.afterShift);
  }
  if (day < e.first.start) {
    if (day >= e.prev.start) return e.prev.key;
    return shiftMonth(sdMonth(day, s), e.beforeShift);
  }
  return s.periods.find((p) => day >= p.start && day <= p.end)!.key;
}

/** Période en cours (contient la date du jour dans le fuseau de l'application). */
export function currentPeriod(s: PeriodSettings, tz: string = APP_TZ): string {
  return periodOf(localDayTime(new Date(), tz).day, s);
}

/** Période enregistrée de cette clé, s'il y en a une. */
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

/** La période couvre exactement le mois du calendrier de sa clé (du 1er au dernier jour). */
export function isCalendarPeriod(key: string, s: PeriodSettings) {
  const { start, end } = periodDates(key, s);
  return start === `${key}-01` && end === addDays(`${shiftMonth(key, 1)}-01`, -1);
}

/** « 22 oct. – 21 nov. » */
export function periodRange(key: string, s: PeriodSettings): string {
  const { start, end } = periodDates(key, s);
  return `${shortDay(start)} – ${shortDay(end)}`;
}

/** « novembre 2026 » : nom enregistré de la période, sinon le mois de sa clé. */
export const periodName = (key: string, s?: PeriodSettings) => (s && storedPeriod(key, s)?.name) || monthLabel(key);

/** « du 22 octobre au 21 novembre 2026 » */
export function periodSpan(key: string, s: PeriodSettings): string {
  const { start: a, end: b } = periodDates(key, s);
  return `du ${longDate(a, a.slice(0, 4) !== b.slice(0, 4))} au ${longDate(b)}`;
}

/** « 21 novembre 2026 » : dernier jour de la période (clôture, fin de journée). */
export const periodEndLabel = (key: string, s: PeriodSettings) => longDate(periodEnd(key, s));

/** Titre avec les dates quand la période ne suit pas le calendrier : « novembre 2026 (22 oct. – 21 nov.) ». */
export function periodTitle(key: string, s: PeriodSettings): string {
  return isCalendarPeriod(key, s) ? periodName(key, s) : `${periodName(key, s)} (${periodRange(key, s)})`;
}

/** Nombre de jours d'une période (dates incluses). */
export const periodDays = (start: string, end: string) => Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000) + 1;

/** Date d'une saisie dans une période : aujourd'hui si la période est en cours, sinon son premier jour. */
export function dayInPeriod(key: string, s: PeriodSettings, tz: string = APP_TZ): string {
  const today = localDayTime(new Date(), tz).day;
  const { start, end } = periodDates(key, s);
  return today >= start && today <= end ? today : start;
}

/** Clé de période lue dans l'URL (?m=YYYY-MM), sinon la période en cours. */
export function parsePeriod(v: string | string[] | undefined, s: PeriodSettings): string {
  return typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v) ? v : currentPeriod(s);
}

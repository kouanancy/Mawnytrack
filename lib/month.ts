// Mois au format "YYYY-MM", calculés dans le fuseau de l'application.
export const APP_TZ = process.env.APP_TIMEZONE || "Africa/Abidjan";

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function parts(date: Date, tz: string) {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (t: string) => p.find((x) => x.type === t)!.value;
  return { y: get("year"), m: get("month"), d: get("day"), h: get("hour"), mi: get("minute") };
}

/** Jour ("YYYY-MM-DD") et heure ("HH:MM") d'un instant dans le fuseau donné. */
export function localDayTime(date: Date, tz: string) {
  const { y, m, d, h, mi } = parts(date, tz);
  return { day: `${y}-${m}-${d}`, time: `${h}:${mi}` };
}

export function currentMonth(tz: string = APP_TZ): string {
  return localDayTime(new Date(), tz).day.slice(0, 7);
}

export function parseMonth(v: string | string[] | undefined, tz: string = APP_TZ): string {
  return typeof v === "string" && MONTH_RE.test(v) ? v : currentMonth(tz);
}

export function isValidMonth(v: unknown): v is string {
  return typeof v === "string" && MONTH_RE.test(v);
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** « octobre 2026 » */
export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Libellé d'un jour du journal : Aujourd'hui, Hier, ou « lundi 12 octobre ». */
export function dayLabel(day: string, today: string): string {
  if (day === today) return "Aujourd'hui";
  const [y, m, d] = today.split("-").map(Number);
  const yest = new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
  if (day === yest) return "Hier";
  const [dy, dm, dd] = day.split("-").map(Number);
  return new Date(Date.UTC(dy, dm - 1, dd)).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

/** Ajoute n jours à une date "YYYY-MM-DD". */
export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Lundi de la semaine contenant ce jour (semaine du lundi au dimanche). */
export function mondayOf(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = dimanche
  return addDays(day, -((dow + 6) % 7));
}

/** « lundi 20 octobre 2026 » */
export function longDay(day: string, weekday = false): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("fr-FR", {
    ...(weekday ? { weekday: "long" as const } : {}),
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

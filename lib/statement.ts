// Modèle du relevé de prêts / emprunts, partagé par la page (/prets/[id]/releve) et le PDF :
// les deux affichent exactement les mêmes lignes.
import type { Direction } from "@/lib/data";
import type { StatementRow } from "@/lib/loans";
import { monthLabel } from "@/lib/month";

export type SRow =
  | { kind: "carry"; date: string; label: string; balance: number }
  | { kind: "month"; label: string }
  | { kind: "move"; date: string; label: string; loan: number | null; pay: number | null; balance: number }
  | { kind: "subtotal"; label: string; loan: number; pay: number; balance: number }
  | { kind: "total"; label: string; loan: number; pay: number }
  | { kind: "end"; label: string; balance: number };

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const longDate = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
};
const shortDate = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;

/** Nom de fichier lisible et sans accents : « Releve-Awa-octobre-2026.pdf ». */
export function fileSlug(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function buildStatement(input: {
  name: string;
  direction: Direction;
  period: string;
  before: number;
  rows: StatementRow[];
  today: string;
}) {
  const { name, period, before, rows, today } = input;
  const L = input.direction === "lent";
  const all = period === "tout";
  const kind = L ? "de prêts" : "d'emprunts";
  const loanLabel = L ? "Prêt" : "Emprunt";
  const label = (r: StatementRow) => r.label || (r.type === "loan" ? loanLabel : "Remboursement");
  const move = (r: StatementRow): SRow => ({
    kind: "move",
    date: shortDate(r.day),
    label: label(r),
    loan: r.type === "loan" ? r.amount : null,
    pay: r.type === "pay" ? r.amount : null,
    balance: r.balance,
  });
  const sum = (list: StatementRow[], t: StatementRow["type"]) => list.filter((r) => r.type === t).reduce((a, r) => a + r.amount, 0);
  const tl = sum(rows, "loan"), tp = sum(rows, "pay");
  const out: SRow[] = [];
  let periodLabel: string;

  if (all) {
    // Tout le relevé : un titre et un sous-total par mois, puis le total général
    const months = new Map<string, StatementRow[]>();
    for (const r of rows) {
      const k = r.day.slice(0, 7);
      months.set(k, [...(months.get(k) ?? []), r]);
    }
    for (const [m, list] of months) {
      out.push({ kind: "month", label: cap(monthLabel(m)) });
      out.push(...list.map(move));
      out.push({ kind: "subtotal", label: `Sous-total ${monthLabel(m)}`, loan: sum(list, "loan"), pay: sum(list, "pay"), balance: list.at(-1)!.balance });
    }
    out.push({ kind: "total", label: "Total général", loan: tl, pay: tp });
    out.push({ kind: "end", label: `Reste dû au ${longDate(today)}`, balance: rows.at(-1)?.balance ?? 0 });
    periodLabel = rows.length ? `du ${longDate(rows[0].day)} au ${longDate(today)}` : `au ${longDate(today)}`;
  } else {
    const [y, m] = period.split("-").map(Number);
    const lastDay = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    out.push({ kind: "carry", date: `01/${String(m).padStart(2, "0")}`, label: "Reste dû au début du mois", balance: before });
    out.push(...rows.map(move));
    out.push({ kind: "total", label: "Total du mois", loan: tl, pay: tp });
    out.push({ kind: "end", label: `Reste dû au ${longDate(lastDay)}`, balance: rows.at(-1)?.balance ?? before });
    periodLabel = cap(monthLabel(period));
  }

  return {
    title: `Relevé ${kind}`,
    name,
    periodLabel,
    loanLabel,
    rows: out,
    empty: rows.length === 0,
    filename: `Releve-${fileSlug(name)}-${all ? "tout" : fileSlug(monthLabel(period))}.pdf`,
  };
}

/** Nom du PDF des sorties : « Sorties-octobre-2026.pdf » ou « Sorties-octobre-2026-Repas.pdf ». */
export function sortiesFilename(monthName: string, category?: string) {
  return `Sorties-${fileSlug(monthName)}${category ? `-${fileSlug(category)}` : ""}.pdf`;
}

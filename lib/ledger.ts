// Règles de calcul partagées par l'affichage et les mises à jour optimistes.
// Les mêmes règles sont appliquées côté serveur en SQL (lib/data.ts, app/(app)/actions.ts).
import type { Entry, Line, MonthData, Totals } from "@/lib/data";
import { fmt } from "@/lib/format";
import { localDayTime } from "@/lib/month";
import { dayInPeriod, type PeriodSettings } from "@/lib/period";

export type LineStatus = "free" | "over" | "empty" | "low" | "ok";

export function lineState(l: Line) {
  const rest = l.planned - l.spent;
  const pct = l.planned ? Math.min(100, (l.spent / l.planned) * 100) : 0;
  const state: LineStatus = !l.planned ? "free" : rest < 0 ? "over" : rest === 0 ? "empty" : rest <= l.planned * 0.2 ? "low" : "ok";
  return { rest, pct, state };
}

export const isExhausted = (l: Line) => l.planned > 0 && l.spent >= l.planned;

/** Reste disponible du mois = revenus + emprunts reçus − dépenses nettes (expense − refund). */
export function summary(t: Totals) {
  const out = t.expense - t.refund;
  const inflow = t.income + t.borrow;
  return { out, inflow, rest: inflow - out, pct: inflow ? Math.round((out / inflow) * 100) : 0 };
}

/** Effet signé d'une transaction sur le « dépensé » de sa ligne. */
const lineDelta = (e: Pick<Entry, "kind" | "amount">) => (e.kind === "expense" ? e.amount : e.kind === "refund" ? -e.amount : 0);

/** Effet sur la somme due à / par une personne. */
function dueDelta(e: Pick<Entry, "kind" | "amount">, dir: Line["direction"]) {
  if (dir === "lent") return e.kind === "expense" ? e.amount : e.kind === "refund" ? -e.amount : 0;
  if (dir === "borrowed") return e.kind === "borrow" ? e.amount : e.kind === "expense" ? -e.amount : 0;
  return 0;
}

const totalKey = { income: "income", borrow: "borrow", expense: "expense", refund: "refund" } as const;

function apply(data: MonthData, e: Entry, sign: 1 | -1): MonthData {
  const totals = { ...data.totals, [totalKey[e.kind]]: data.totals[totalKey[e.kind]] + sign * e.amount };
  const lines = data.lines.map((l) =>
    l.id === e.lineId
      ? {
          ...l,
          spent: Math.max(0, l.spent + sign * lineDelta(e)),
          expense: l.expense + (e.kind === "expense" ? sign * e.amount : 0),
          refund: l.refund + (e.kind === "refund" ? sign * e.amount : 0),
          due: Math.max(0, l.due + sign * dueDelta(e, l.direction)),
        }
      : l,
  );
  return { ...data, totals, lines };
}

export type Op =
  | { type: "add"; entry: Entry }
  | { type: "delete"; id: string }
  | { type: "plan"; id: string; planned: number }
  | { type: "addLine"; line: Line }
  | { type: "deleteLine"; id: string };

/** Réducteur des mises à jour optimistes : l'écran reflète la saisie avant la réponse du serveur. */
export function reduce(data: MonthData, op: Op): MonthData {
  switch (op.type) {
    case "add":
      return { ...apply(data, op.entry, 1), entries: [op.entry, ...data.entries] };
    case "delete": {
      const e = data.entries.find((x) => x.id === op.id);
      return e ? { ...apply(data, e, -1), entries: data.entries.filter((x) => x.id !== op.id) } : data;
    }
    case "plan":
      return { ...data, lines: data.lines.map((l) => (l.id === op.id ? { ...l, planned: op.planned } : l)) };
    case "addLine":
      return { ...data, lines: [...data.lines, op.line] };
    case "deleteLine":
      return {
        ...data,
        lines: data.lines.filter((l) => l.id !== op.id),
        entries: data.entries.map((e) => (e.lineId === op.id ? { ...e, lineId: null, lineLabel: null } : e)),
      };
  }
}

/**
 * Horodatage local d'une saisie (même règle que le serveur) : maintenant pour la période en cours,
 * sinon le premier jour de la période affichée.
 */
export function stamp(month: string, tz: string, ps: PeriodSettings) {
  return { day: dayInPeriod(month, ps, tz), time: localDayTime(new Date(), tz).time };
}

export const tempId = () => `tmp-${Math.random().toString(36).slice(2, 10)}`;
export const isTemp = (id: string) => id.startsWith("tmp-");

/** Catégorie affichée dans le journal. */
export function category(e: Entry): string {
  if (e.kind === "income") return "Revenu";
  if (e.kind === "borrow") return `Emprunt · ${e.personName ?? ""}`;
  if (!e.lineLabel) return "Sans ligne";
  if (e.direction === "borrowed") return `Remboursement · ${e.lineLabel}`;
  if (e.direction === "lent") return `${e.kind === "refund" ? "Remboursement" : "Prêt"} · ${e.lineLabel}`;
  return e.lineLabel;
}

/** Message de confirmation de suppression. */
export function deleteNotice(e: Entry): string {
  if (e.kind === "borrow") return "L'emprunt sera aussi retiré du volet Prêts.";
  if (e.kind === "expense" && e.direction === "lent") return "Le prêt correspondant sera aussi retiré.";
  if (e.kind === "refund" || (e.kind === "expense" && e.direction === "borrowed"))
    return "Le remboursement sera aussi retiré du volet Prêts.";
  return "Supprimer cette ligne ?";
}

export type Check = { ok: boolean; hint: string; bad: boolean };

/**
 * Règle essentielle : aucun dépassement de budget. Une ligne au budget prévu > 0 refuse toute
 * dépense qui ferait dépasser le total du mois ; une ligne à 0 n'a pas de plafond.
 */
export function checkExpense(l: Line | undefined, amount: number): Check {
  if (!l) return { ok: false, bad: false, hint: "" };
  const { rest } = lineState(l);
  if (l.planned && rest <= 0)
    return {
      ok: false,
      bad: true,
      hint: `Budget déjà atteint pour « ${l.label} ». Aucune nouvelle dépense possible sans modifier le budget prévu.`,
    };
  if (l.planned && amount > rest)
    return { ok: false, bad: true, hint: `Montant trop élevé : il reste ${fmt(rest)} FCFA sur « ${l.label} ».` };
  if (l.direction === "borrowed") {
    if (l.due <= 0) return { ok: false, bad: true, hint: `Aucune somme à rendre à ${l.label}.` };
    if (amount > l.due)
      return { ok: false, bad: true, hint: `Montant supérieur au reste à rendre à ${l.label} (${fmt(l.due)} FCFA).` };
  }
  return { ok: true, bad: false, hint: lineHint(l) };
}

function lineHint(l: Line): string {
  const { rest } = lineState(l);
  if (l.direction === "borrowed")
    return `Remboursement à ${l.label} · reste à rendre : ${fmt(l.due)} FCFA${l.planned ? ` · budget du mois : reste ${fmt(rest)}` : ""}`;
  if (l.direction === "lent") return `Ajouté comme nouveau prêt à ${l.label} · dû actuellement : ${fmt(l.due)} FCFA`;
  if (!l.planned) return "Aucun budget prévu sur cette ligne.";
  return `Reste ${fmt(rest)} FCFA sur ${fmt(l.planned)} prévus`;
}

/** Libellé par défaut d'une dépense sans libellé (identique au serveur). */
export function defaultLabel(l: Line): string {
  if (l.direction === "borrowed") return `Remboursement à ${l.label}`;
  if (l.direction === "lent") return "Prêt";
  return l.label;
}

/** Groupes de lignes : Budget / Prêts accordés / Remboursements d'emprunts. */
export function lineGroups(lines: Line[]) {
  return [
    { name: "Budget", lines: lines.filter((l) => !l.personId) },
    { name: "Prêts accordés", lines: lines.filter((l) => l.direction === "lent") },
    { name: "Remboursements d'emprunts", lines: lines.filter((l) => l.direction === "borrowed") },
  ];
}

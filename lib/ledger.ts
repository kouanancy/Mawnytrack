// Règles de calcul partagées par l'affichage et les mises à jour optimistes.
// Les mêmes règles sont appliquées côté serveur en SQL (lib/data.ts, app/(app)/actions.ts).
import type { Direction, Entry, Line, MonthData, Totals } from "@/lib/data";
import { fmt } from "@/lib/format";
import { localDayTime } from "@/lib/month";
import { dayInPeriod, periodOf, periodTitle, type PeriodSettings } from "@/lib/period";

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

/**
 * Épargne d'une période (même règle que la caisse, lib/caisse.ts) : épargne prévue = revenus − budget prévu
 * (minimum 0) ; épargne réelle = revenus − dépenses nettes (minimum 0) ; non dépensé = différence, ajouté à la
 * caisse à la clôture de la période.
 */
export function savingSplit(income: number, planned: number, out: number) {
  const plan = Math.max(0, income - planned);
  const real = Math.max(0, income - out);
  return { plan, real, unspent: real - plan };
}

/** Effet signé d'une transaction sur le « dépensé » de sa ligne. */
const lineDelta = (e: Pick<Entry, "kind" | "amount">) => (e.kind === "expense" ? e.amount : e.kind === "refund" ? -e.amount : 0);

/** Effet sur la somme due à / par une personne. */
function dueDelta(e: Pick<Entry, "kind" | "amount">, dir: Line["direction"]) {
  if (dir === "lent") return e.kind === "expense" ? e.amount : e.kind === "refund" ? -e.amount : 0;
  if (dir === "borrowed") return e.kind === "borrow" ? e.amount : e.kind === "expense" ? -e.amount : 0;
  return 0;
}

/** Mouvement « prêt » (prêt accordé, emprunt reçu) ou « remboursement » d'une personne. */
function moveKind(e: Pick<Entry, "kind">, dir: Line["direction"]): "loan" | "pay" | null {
  if (dir === "lent") return e.kind === "expense" ? "loan" : e.kind === "refund" ? "pay" : null;
  if (dir === "borrowed") return e.kind === "borrow" ? "loan" : e.kind === "expense" ? "pay" : null;
  return null;
}

const totalKey = { income: "income", borrow: "borrow", expense: "expense", refund: "refund" } as const;

function apply(data: MonthData, e: Entry, sign: 1 | -1): MonthData {
  const totals = { ...data.totals, [totalKey[e.kind]]: data.totals[totalKey[e.kind]] + sign * e.amount };
  // Emprunt reçu : sans ligne, rattaché à la ligne de sa personne
  const lines = data.lines.map((l) =>
    l.id === e.lineId || (e.personId != null && l.personId === e.personId)
      ? {
          ...l,
          spent: Math.max(0, l.spent + sign * lineDelta(e)),
          expense: l.expense + (e.kind === "expense" ? sign * e.amount : 0),
          refund: l.refund + (e.kind === "refund" ? sign * e.amount : 0),
          due: Math.max(0, l.due + sign * dueDelta(e, l.direction)),
          loans: l.loans + (moveKind(e, l.direction) === "loan" ? sign * e.amount : 0),
          pays: l.pays + (moveKind(e, l.direction) === "pay" ? sign * e.amount : 0),
        }
      : l,
  );
  return { ...data, totals, lines };
}

/**
 * Modification d'un mouvement. keep = la nouvelle date reste dans la période affichée ; sinon le mouvement
 * quitte le journal et les totaux de la période, mais les montants cumulés de la personne gardent la nouvelle valeur.
 */
function edit(data: MonthData, entry: Entry, keep: boolean): MonthData {
  const old = data.entries.find((x) => x.id === entry.id);
  if (!old) return data;
  const without = apply(data, old, -1);
  const next = apply(without, entry, 1);
  if (keep) {
    const entries = data.entries
      .map((x) => (x.id === entry.id ? entry : x))
      .sort((a, b) => (b.day + b.time).localeCompare(a.day + a.time));
    return { ...next, entries };
  }
  const lines = next.lines.map((l, i) => {
    const w = without.lines[i];
    // Ligne 'lent' : accordé cumulé sur toute la durée ; autres lignes : dépensé de la période
    return l.direction === "lent" ? l : { ...l, spent: w.spent, expense: w.expense, refund: w.refund };
  });
  return { ...next, totals: without.totals, lines, entries: data.entries.filter((x) => x.id !== entry.id) };
}

export type Op =
  | { type: "add"; entry: Entry }
  | { type: "delete"; id: string }
  | { type: "edit"; entry: Entry; keep: boolean }
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
    case "edit":
      return edit(data, op.entry, op.keep);
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

/* ---------- Modification d'un mouvement de prêt ou d'emprunt ---------- */

/**
 * Contexte d'un mouvement lié à une personne (mêmes règles côté serveur, app/(app)/prets/actions.ts).
 * loans / pays : totaux de la personne, mouvement compris (prêté ou emprunté / remboursé).
 */
export type MoveCtx = {
  direction: Direction;
  name: string;
  /** true : prêt accordé ou emprunt reçu ; false : remboursement */
  isLoan: boolean;
  /** Montant actuel du mouvement */
  old: number;
  loans: number;
  pays: number;
  /** Personne 'lent' : budget prévu de sa ligne (0 = sans plafond) */
  planned: number;
  /**
   * Remboursement d'emprunt : budget de la période de la nouvelle date et dépensé de la ligne sur cette période,
   * mouvement exclu ; same = même période qu'avant. Absent quand la période n'est pas connue (contrôle serveur).
   */
  period?: { planned: number; spent: number; same: boolean; title: string } | null;
};

/** Contrôle d'un nouveau montant ; une modification qui n'aggrave pas la situation reste toujours possible. */
export function checkMove(c: MoveCtx, amount: number): Check {
  if (!amount) return { ok: false, bad: false, hint: "" };
  const L = c.direction === "lent";
  const loans = c.loans - (c.isLoan ? c.old : 0) + (c.isLoan ? amount : 0);
  const pays = c.pays - (c.isLoan ? 0 : c.old) + (c.isLoan ? 0 : amount);
  const bad = (hint: string): Check => ({ ok: false, bad: true, hint });

  if (pays > loans && pays - loans > c.pays - c.loans) {
    if (c.isLoan) {
      const min = c.pays - (c.loans - c.old);
      return bad(
        `Le total ${L ? "prêté à" : "emprunté à"} ${c.name} ne peut pas être inférieur aux ${fmt(c.pays)} FCFA déjà remboursés : montant minimum ${fmt(min)} FCFA.`,
      );
    }
    const max = Math.max(0, c.loans - (c.pays - c.old));
    return bad(
      L
        ? `Montant supérieur à ce que doit ${c.name} : maximum ${fmt(max)} FCFA.`
        : `Montant supérieur au reste à rendre à ${c.name} : maximum ${fmt(max)} FCFA.`,
    );
  }
  if (L && c.planned > 0 && loans - pays > c.planned && loans - pays > c.loans - c.pays) {
    if (c.isLoan) {
      const max = Math.max(0, c.planned - (c.loans - c.old - c.pays));
      return bad(`L'accordé de « ${c.name} » ne peut pas dépasser son budget prévu (${fmt(c.planned)} FCFA) : maximum ${fmt(max)} FCFA.`);
    }
    const min = c.loans - c.planned - (c.pays - c.old);
    return bad(`L'accordé de « ${c.name} » ne peut pas dépasser son budget prévu (${fmt(c.planned)} FCFA) : montant minimum ${fmt(min)} FCFA.`);
  }
  const p = c.period;
  if (!L && !c.isLoan && p && p.planned > 0 && p.spent + amount > p.planned && !(p.same && amount <= c.old)) {
    return bad(`Montant supérieur au budget de « ${c.name} » pour ${p.title} : maximum ${fmt(Math.max(0, p.planned - p.spent))} FCFA.`);
  }
  return { ok: true, bad: false, hint: "" };
}

/** Mouvement modifiable depuis un journal : toute transaction liée à une personne. */
export const isMove = (e: Entry) => e.direction != null && e.kind !== "income";

/**
 * Contexte de contrôle d'un mouvement du journal d'une période (month), pour une nouvelle date. Le budget de la
 * période n'est connu que si la nouvelle date reste dans la période affichée ; sinon le serveur le contrôle.
 */
export function entryMoveCtx(data: MonthData, e: Entry, date: string, month: string, ps: PeriodSettings): MoveCtx | null {
  const l = data.lines.find((x) => x.personId != null && x.personId === e.personId);
  if (!l || !e.direction || !isMove(e)) return null;
  const isLoan = moveKind(e, e.direction) === "loan";
  const same = periodOf(date, ps) === month;
  return {
    direction: e.direction,
    name: l.label,
    isLoan,
    old: e.amount,
    loans: l.loans,
    pays: l.pays,
    planned: e.direction === "lent" ? l.planned : 0,
    period:
      e.direction === "borrowed" && !isLoan && same
        ? { planned: l.planned, spent: Math.max(0, l.spent - e.amount), same: true, title: periodTitle(month, ps) }
        : null,
  };
}

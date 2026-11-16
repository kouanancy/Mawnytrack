// Rapport de la caisse d'un projet, partagé par la page (/investissements/[id]/rapport) et le PDF :
// les deux affichent exactement les mêmes lignes.
//   après une sortie : mouvements jusqu'à cette sortie incluse, ligne de la sortie mise en avant ;
//   complet : tous les mouvements à ce jour.
import type { ProjectMove } from "@/lib/caisse";
import { fileSlug } from "@/lib/statement";

export type ReportLine = {
  /** « 16/11/2026 » et « 16/11 » (téléphone) */
  date: string;
  short: string;
  label: string;
  /** Entrée (approvisionnement) ou sortie (sortie, restitution) */
  in: number | null;
  out: number | null;
  /** Solde du projet après ce mouvement */
  balance: number;
  highlight: boolean;
};

const longDate = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d))
    .toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
    .replace(/^1 /, "1er ");
};

/** moves : du plus ancien au plus récent ; after : identifiant d'une sortie (rapport après cette sortie). */
export function buildProjectReport(input: { name: string; moves: ProjectMove[]; after?: string | null; today: string }) {
  const { name, today } = input;
  const cut = input.after ? input.moves.findIndex((m) => m.id === input.after && m.type === "out") : -1;
  const target = cut >= 0 ? input.moves[cut] : null;
  const moves = target ? input.moves.slice(0, cut + 1) : input.moves;

  let balance = 0;
  const lines: ReportLine[] = moves.map((m) => {
    balance += m.type === "fund" ? m.amount : -m.amount;
    return {
      date: `${m.day.slice(8, 10)}/${m.day.slice(5, 7)}/${m.day.slice(0, 4)}`,
      short: `${m.day.slice(8, 10)}/${m.day.slice(5, 7)}`,
      label: m.type === "back" ? `${m.label || "Restitution à la caisse"} (restitution)` : m.label || (m.type === "fund" ? "Approvisionnement" : "Sortie"),
      in: m.type === "fund" ? m.amount : null,
      out: m.type === "fund" ? null : m.amount,
      balance,
      highlight: m.id === target?.id,
    };
  });
  const sum = (t: ProjectMove["type"]) => moves.filter((m) => m.type === t).reduce((a, m) => a + m.amount, 0);
  const funded = sum("fund"), spent = sum("out"), back = sum("back");
  const day = target ? target.day : today;
  return {
    title: "Rapport du projet",
    name,
    subtitle: target ? `Après la sortie « ${target.label || "Sortie"} » du ${longDate(target.day)}` : `Rapport complet au ${longDate(today)}`,
    lines,
    totals: { in: funded, out: spent + back },
    end: { label: target ? "Solde du projet après cette sortie" : "Solde du projet à ce jour", balance },
    summary: { funded, spent, back },
    filename: `Rapport-${fileSlug(name)}-${day}.pdf`,
    after: target?.id ?? null,
  };
}

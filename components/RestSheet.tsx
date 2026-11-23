"use client";

import { Sheet } from "@/components/Sheet";
import type { MonthData } from "@/lib/data";
import { fmt, fmtNb } from "@/lib/format";
import { lineGroups, lineState, restBreakdown } from "@/lib/ledger";

/**
 * Détail de l'« Argent restant » du Budget : reste par ligne (lignes au budget prévu > 0 dont le reste est
 * positif), groupé comme le Budget et trié du plus grand reste au plus petit. Mêmes chiffres que les lignes
 * (lineState) ; sous le total, le détail de ce qui complète l'argent restant (restBreakdown) : revenus non
 * affectés, emprunts reçus, dépenses sans plafond, rapprochements ; le total du panneau égale toujours l'argent
 * restant de la synthèse.
 * Affiché dans le panneau commun Sheet (bas de l'écran sur téléphone, centré sur ordinateur).
 */
export function RestSheet({
  data,
  period,
  onClose,
  onPick,
}: {
  /** Données de la période affichée (mêmes chiffres que la synthèse et les lignes du Budget) */
  data: MonthData;
  /** « novembre 2026 · 22 oct. – 21 nov. » */
  period: string;
  onClose: () => void;
  /** Appui sur une ligne : fermer et faire défiler jusqu'à elle */
  onPick: (lineId: string) => void;
}) {
  const b = restBreakdown(data);
  const { rest } = b;
  const groups = lineGroups(data.lines)
    .map((g) => ({
      name: g.name,
      rows: g.lines
        .map((l) => ({ l, rest: lineState(l).rest }))
        .filter((x) => x.l.planned > 0 && x.rest > 0)
        .sort((a, b) => b.rest - a.rest),
    }))
    .filter((g) => g.rows.length);
  const total = groups.reduce((a, g) => a + g.rows.reduce((s, x) => s + x.rest, 0), 0);
  // Ce qui complète l'argent restant, une ligne par élément non nul (signé : + ajoute, − déduit)
  const items = [
    { label: b.unassigned >= 0 ? "Revenus non affectés à une ligne" : "Part des restes non couverte par les revenus", value: b.unassigned },
    { label: "Emprunts reçus", value: b.borrow },
    { label: "Dépenses sans plafond", value: -b.uncapped },
    { label: "Rapprochements (entrées − dépenses non répertoriées)", value: b.reconcile },
  ].filter((x) => x.value !== 0);
  const signed = (v: number) => `${v < 0 ? "−" : "+"}${fmtNb(Math.abs(v))}`;

  return (
    <Sheet title="Reste par ligne" subtitle={period} onClose={onClose}>
        {groups.length ? (
          <table className="rs-tbl">
            <thead>
              <tr>
                <th scope="col">Ligne</th>
                <th scope="col">Prévu</th>
                <th scope="col">Dépensé</th>
                <th scope="col">Reste</th>
              </tr>
            </thead>
            {groups.map((g) => (
              <tbody key={g.name}>
                <tr className="rs-group">
                  <th scope="rowgroup" colSpan={4}>
                    {g.name}
                  </th>
                </tr>
                {g.rows.map(({ l, rest: r }) => (
                  <tr key={l.id} className="rs-row" onClick={() => onPick(l.id)}>
                    <th scope="row">
                      <button type="button" className="rs-name" onClick={(e) => (e.stopPropagation(), onPick(l.id))}>
                        {l.label}
                      </button>
                    </th>
                    <td className="num">{fmt(l.planned)}</td>
                    <td className="num">{fmt(l.spent)}</td>
                    <td className="num rs-rest">{fmt(r)}</td>
                  </tr>
                ))}
              </tbody>
            ))}
            <tfoot>
              <tr className="rs-total">
                <th scope="row" colSpan={3}>
                  Total restant sur les lignes
                </th>
                <td className="num">{fmt(total)}</td>
              </tr>
            </tfoot>
          </table>
        ) : (
          <p className="rs-empty">Toutes les lignes sont entièrement dépensées.</p>
        )}
        {items.length > 0 && (
          <table className="rs-recap-tbl num">
            <tbody>
              {items.map((x) => (
                <tr key={x.label}>
                  <th scope="row">{x.label}</th>
                  <td>{signed(x.value)}&nbsp;FCFA</td>
                </tr>
              ))}
              <tr className="rs-recap-end">
                <th scope="row">Argent restant</th>
                <td>
                  {rest < 0 ? "−" : ""}
                  {fmtNb(Math.abs(rest))}&nbsp;FCFA
                </td>
              </tr>
            </tbody>
          </table>
        )}
    </Sheet>
  );
}

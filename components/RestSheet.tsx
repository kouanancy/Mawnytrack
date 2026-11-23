"use client";

import { Sheet } from "@/components/Sheet";
import type { Line } from "@/lib/data";
import { fmt, fmtNb } from "@/lib/format";
import { lineGroups, lineState } from "@/lib/ledger";

/**
 * Détail de l'« Argent restant » du Budget : reste par ligne (lignes au budget prévu > 0 dont le reste est
 * positif), groupé comme le Budget et trié du plus grand reste au plus petit. Mêmes chiffres que les lignes
 * (lineState) ; l'écart avec l'argent restant (revenus non affectés…) est expliqué sous le total.
 * Affiché dans le panneau commun Sheet (bas de l'écran sur téléphone, centré sur ordinateur).
 */
export function RestSheet({
  lines,
  rest,
  period,
  onClose,
  onPick,
}: {
  lines: Line[];
  /** Argent restant de la synthèse */
  rest: number;
  /** « novembre 2026 · 22 oct. – 21 nov. » */
  period: string;
  onClose: () => void;
  /** Appui sur une ligne : fermer et faire défiler jusqu'à elle */
  onPick: (lineId: string) => void;
}) {
  const groups = lineGroups(lines)
    .map((g) => ({
      name: g.name,
      rows: g.lines
        .map((l) => ({ l, rest: lineState(l).rest }))
        .filter((x) => x.l.planned > 0 && x.rest > 0)
        .sort((a, b) => b.rest - a.rest),
    }))
    .filter((g) => g.rows.length);
  const total = groups.reduce((a, g) => a + g.rows.reduce((b, x) => b + x.rest, 0), 0);
  const gap = rest - total;

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
        {gap !== 0 && (
          <div className="rs-recap num">
            <p>
              {gap > 0 ? "Revenus non affectés à une ligne" : "Part des restes non couverte par les revenus"} :{" "}
              {gap < 0 ? "−" : ""}
              {fmtNb(Math.abs(gap))}&nbsp;FCFA
            </p>
            <p>
              <b>Argent restant : {rest < 0 ? "−" : ""}{fmtNb(Math.abs(rest))}&nbsp;FCFA</b>
            </p>
          </div>
        )}
    </Sheet>
  );
}

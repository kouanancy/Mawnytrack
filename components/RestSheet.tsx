"use client";

import { useEffect, useRef } from "react";
import type { Line } from "@/lib/data";
import { fmt, fmtNb } from "@/lib/format";
import { lineGroups, lineState } from "@/lib/ledger";

/**
 * Détail de l'« Argent restant » du Budget : reste par ligne (lignes au budget prévu > 0 dont le reste est
 * positif), groupé comme le Budget et trié du plus grand reste au plus petit. Mêmes chiffres que les lignes
 * (lineState) ; l'écart avec l'argent restant (revenus non affectés…) est expliqué sous le total.
 * Fenêtre qui monte du bas sur téléphone, centrée sur ordinateur ; fermeture par la croix, Échap ou un appui
 * à l'extérieur.
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
  const panel = useRef<HTMLDivElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);

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

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeBtn.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") return onClose();
      if (e.key !== "Tab" || !panel.current) return;
      // Le focus reste dans le panneau
      const items = panel.current.querySelectorAll<HTMLElement>("button");
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) (e.preventDefault(), last.focus());
      else if (!e.shiftKey && document.activeElement === last) (e.preventDefault(), first.focus());
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      before?.focus?.({ preventScroll: true });
    };
  }, [onClose]);

  return (
    <div className="rs-bg" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="rs-panel" ref={panel} role="dialog" aria-modal="true" aria-labelledby="rs-title">
        <div className="rs-head">
          <div>
            <h2 id="rs-title">Reste par ligne</h2>
            <span>{period}</span>
          </div>
          <button type="button" className="iconbtn" ref={closeBtn} aria-label="Fermer" onClick={onClose}>
            ×
          </button>
        </div>
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
      </div>
    </div>
  );
}

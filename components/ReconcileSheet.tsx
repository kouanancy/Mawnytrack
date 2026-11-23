"use client";

import { useState } from "react";
import { Sheet } from "@/components/Sheet";
import { fmt, fmtNb, formatInput, parseAmount } from "@/lib/format";

/**
 * Rapprochement avec l'argent réel : l'argent réellement disponible (espèces, mobile money, banque) est comparé
 * au reste disponible de Mawnytrack. Écart négatif : dépense sur la ligne « Dépenses non répertoriées » ; écart
 * positif : entrée non répertoriée (revenu). Après l'enregistrement, le reste disponible égale l'argent réel.
 */
export function ReconcileSheet({
  rest,
  onClose,
  onExpense,
  onIncome,
}: {
  /** Reste disponible de la période en cours */
  rest: number;
  onClose: () => void;
  onExpense: (amount: number) => void;
  onIncome: (amount: number) => void;
}) {
  const [real, setReal] = useState("");
  const entered = real.trim() !== "";
  const y = parseAmount(real);
  const gap = y - rest;
  const signed = (n: number) => `${n < 0 ? "−" : n > 0 ? "+" : ""}${fmtNb(Math.abs(n))}`;

  return (
    <Sheet title="Rapprocher avec mon argent réel" onClose={onClose} initialFocus="#rc-real">
      <div className="rc">
        <div className="field">
          <label htmlFor="rc-real">Argent réellement disponible (FCFA)</label>
          <input
            id="rc-real"
            inputMode="numeric"
            placeholder="0"
            autoComplete="off"
            value={real}
            onChange={(e) => setReal(formatInput(e.target.value))}
          />
        </div>
        <p className="hint">Espèces, mobile money et banque : saisissez le total.</p>
        <table className="cm-tbl rc-tbl">
          <tbody>
            <tr>
              <th scope="row">Reste dans Mawnytrack</th>
              <td className="num">{fmt(rest)}</td>
            </tr>
            <tr>
              <th scope="row">Argent réel</th>
              <td className="num">{entered ? fmt(y) : "—"}</td>
            </tr>
            <tr className="total">
              <th scope="row">Écart</th>
              <td className={`num${entered && gap < 0 ? " rc-neg" : entered && gap > 0 ? " rc-pos" : ""}`}>
                {entered ? `${signed(gap)} FCFA` : "—"}
              </td>
            </tr>
          </tbody>
        </table>
        {entered &&
          (gap < 0 ? (
            <>
              <p className="hint">L&apos;argent réel est inférieur : la différence est enregistrée comme dépense non répertoriée.</p>
              <button type="button" className="btn out" onClick={() => onExpense(-gap)}>
                Enregistrer {fmt(-gap)} FCFA en dépenses non répertoriées
              </button>
            </>
          ) : gap > 0 ? (
            <>
              <p className="hint">L&apos;argent réel est supérieur : la différence est enregistrée comme entrée non répertoriée.</p>
              <button type="button" className="btn" onClick={() => onIncome(gap)}>
                Enregistrer {fmt(gap)} FCFA en entrée non répertoriée
              </button>
            </>
          ) : (
            <p className="rc-ok" role="status">
              Les comptes sont équilibrés.
            </p>
          ))}
      </div>
    </Sheet>
  );
}

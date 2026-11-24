"use client";

import { useEffect, useState } from "react";
import { closingInfo } from "@/app/month-actions";
import { Sheet } from "@/components/Sheet";
import { fmt, formatInput, parseAmount } from "@/lib/format";

/**
 * Fenêtre de clôture du mois en cours (bouton « Clôturer » de la barre du mois) : reste du mois à ce jour, montant
 * à reporter en revenu sur le mois suivant (0 par défaut, jamais au-dessus du reste), « Clôturer le mois » et
 * « Annuler ». Le reste du mois − le montant reporté va dans la caisse.
 */
export function CloseSheet({
  monthKey,
  title,
  range,
  nextName,
  pending,
  onConfirm,
  onClose,
}: {
  monthKey: string;
  /** « Clôturer novembre 2026 » */
  title: string;
  /** « Du 24 octobre 2026 au 24 novembre 2026 (aujourd'hui) » */
  range: string;
  nextName: string;
  pending: boolean;
  onConfirm: (carry: number) => void;
  onClose: () => void;
}) {
  const [rest, setRest] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [value, setValue] = useState("");

  useEffect(() => {
    let live = true;
    closingInfo(monthKey).then((r) => {
      if (!live) return;
      if (r.ok) setRest(r.rest);
      else setError(r.error);
    });
    return () => {
      live = false;
    };
  }, [monthKey]);

  const positive = rest !== null && rest > 0;
  // Le champ n'apparaît qu'une fois le reste connu : il reçoit alors le focus
  useEffect(() => {
    if (positive) document.getElementById("cl-carry")?.focus();
  }, [positive]);
  const carry = parseAmount(value);
  const over = positive && carry > rest!;
  const ready = rest !== null && !over && !pending;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;
    onConfirm(positive ? carry : 0);
  }

  return (
    <Sheet title={title} subtitle={range} onClose={onClose} initialFocus="#cl-carry">
      <form className="cl" onSubmit={submit} aria-busy={rest === null}>
        <div className="cl-rest" role="status">
          <span>Reste du mois</span>
          <strong className="num">{rest === null ? (error ? "—" : "…") : `${fmt(rest)} FCFA`}</strong>
        </div>
        {error && <p className="hint bad">{error}</p>}
        {rest !== null &&
          (positive ? (
            <div className="field">
              <label htmlFor="cl-carry">Montant à reporter en revenu sur {nextName}</label>
              <div className="cl-amt">
                <input
                  id="cl-carry"
                  inputMode="numeric"
                  placeholder="0"
                  autoComplete="off"
                  aria-invalid={over}
                  aria-describedby={over ? "cl-err" : undefined}
                  value={value}
                  onChange={(e) => setValue(formatInput(e.target.value))}
                />
                <span aria-hidden="true">FCFA</span>
              </div>
              {over && (
                <p id="cl-err" className="hint num">
                  <span className="bad">Au plus {fmt(rest!)} FCFA : le reste du mois.</span>
                </p>
              )}
            </div>
          ) : (
            <p className="hint cl-none">Aucun reste positif : rien n&apos;est envoyé dans la caisse ni reporté.</p>
          ))}
        <div className="confirm cl-actions">
          <button type="submit" className="btn out" disabled={!ready}>
            Clôturer le mois
          </button>
          <button type="button" className="btn ghost" onClick={onClose}>
            Annuler
          </button>
        </div>
      </form>
    </Sheet>
  );
}

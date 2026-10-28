"use client";

import { useState } from "react";
import { fmt, formatInput, parseAmount } from "@/lib/format";
import { checkMove, type MoveCtx } from "@/lib/ledger";

export type MoveEdit = { amount: number; label: string; date: string };

/**
 * Formulaire de modification d'un mouvement de prêt ou d'emprunt, affiché dans la page à la place de la ligne :
 * Montant, Libellé, Date, « Enregistrer » et « Annuler » (ou Échap). Contrôle pendant la saisie (checkMove) ;
 * ctx(date) donne le contexte de la nouvelle date (budget de la période pour un remboursement d'emprunt).
 */
export function MoveEditForm({
  title,
  initial,
  today,
  ctx,
  onSave,
  onCancel,
}: {
  title: string;
  initial: MoveEdit;
  today: string;
  ctx: (date: string) => MoveCtx;
  onSave: (v: MoveEdit) => void;
  onCancel: () => void;
}) {
  const [amount, setAmount] = useState(fmt(initial.amount));
  const [label, setLabel] = useState(initial.label);
  const [date, setDate] = useState(initial.date);
  const amt = parseAmount(amount);
  const check = checkMove(ctx(date), amt);
  const future = date > today && date !== initial.date;
  const ok = check.ok && !!date && !future;
  const unchanged = amt === initial.amount && label.trim() === initial.label && date === initial.date;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ok) return;
    if (unchanged) return onCancel();
    onSave({ amount: amt, label: label.trim(), date });
  }

  return (
    <form
      className="move-edit"
      aria-label={`Modifier : ${title}`}
      onSubmit={submit}
      onKeyDown={(e) => e.key === "Escape" && onCancel()}
    >
      <b>{title}</b>
      <div className="row">
        <div className="field amount">
          <label htmlFor="me-a">Montant (FCFA)</label>
          <input
            id="me-a"
            inputMode="numeric"
            required
            autoComplete="off"
            autoFocus
            value={amount}
            onChange={(e) => setAmount(formatInput(e.target.value))}
          />
        </div>
        <div className="field">
          <label htmlFor="me-d">Date</label>
          <input id="me-d" type="date" required value={date} max={date > today ? date : today} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>
      <div className="field">
        <label htmlFor="me-l">Libellé</label>
        <input id="me-l" maxLength={120} autoComplete="off" value={label} onChange={(e) => setLabel(e.target.value)} />
      </div>
      {(check.bad || future) && (
        <p className="hint num" aria-live="polite">
          <span className="bad">{future ? "La date ne peut pas être dans le futur." : check.hint}</span>
        </p>
      )}
      <div className="confirm">
        <button className="btn sm" type="submit" disabled={!ok}>
          Enregistrer
        </button>
        <button className="btn sm ghost" type="button" onClick={onCancel}>
          Annuler
        </button>
      </div>
    </form>
  );
}

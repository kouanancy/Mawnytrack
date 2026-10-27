"use client";

import { useOptimistic, useRef, useState, useTransition } from "react";
import { addIncome, deleteTransaction } from "@/app/(app)/actions";
import { Journal } from "@/components/Journal";
import { useToast } from "@/components/Toast";
import type { MonthData } from "@/lib/data";
import { fmt, formatInput, parseAmount } from "@/lib/format";
import { reduce, stamp, summary, tempId } from "@/lib/ledger";

export function RevenusView({ data, month, today, tz }: { data: MonthData; month: string; today: string; tz: string }) {
  const [view, addOp] = useOptimistic(data, reduce);
  const [, startTransition] = useTransition();
  const toast = useToast();
  const [amount, setAmount] = useState("");
  const [label, setLabel] = useState("");
  const amountRef = useRef<HTMLInputElement>(null);
  const { rest } = summary(view.totals);

  function submit(ev: React.FormEvent) {
    ev.preventDefault();
    const amt = parseAmount(amount);
    if (!amt) return toast("Saisissez un montant");
    const { day, time } = stamp(month, tz);
    const sent = { month, amount: amt, label };
    setAmount("");
    setLabel("");
    amountRef.current?.focus();
    startTransition(async () => {
      addOp({
        type: "add",
        entry: {
          id: tempId(),
          kind: "income",
          amount: amt,
          label: sent.label.trim() || "Revenu",
          lineId: null,
          lineLabel: null,
          direction: null,
          personName: null,
          day,
          time,
          at: new Date().toISOString(),
        },
      });
      const res = await addIncome(sent);
      toast(res.ok ? `+${fmt(amt)} FCFA enregistrés` : res.error);
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      addOp({ type: "delete", id });
      const res = await deleteTransaction(id);
      toast(res.ok ? "Ligne supprimée" : res.error);
    });
  }

  return (
    <>
      <div className="tiles">
        <div className="tile">
          <span>Revenus du mois</span>
          <strong className="num" style={{ color: "var(--in)" }}>
            +{fmt(view.totals.income)}
          </strong>
        </div>
        <div className="tile">
          <span>Reste disponible</span>
          <strong className="num">{fmt(rest)}</strong>
        </div>
      </div>
      <form className="quick" aria-label="Ajouter un revenu" onSubmit={submit}>
        <div className="row">
          <div className="field amount">
            <label htmlFor="r-amt">Montant (FCFA)</label>
            <input
              id="r-amt"
              ref={amountRef}
              inputMode="numeric"
              placeholder="0"
              autoComplete="off"
              required
              value={amount}
              onChange={(e) => setAmount(formatInput(e.target.value))}
            />
          </div>
          <div className="field" style={{ flex: "2 1 160px" }}>
            <label htmlFor="r-lbl">Source</label>
            <input
              id="r-lbl"
              placeholder="Ex. salaire, vente, prime…"
              autoComplete="off"
              maxLength={120}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>
        </div>
        <button className="btn" type="submit">
          Ajouter le revenu
        </button>
      </form>
      <div className="sect">
        <h2>Revenus enregistrés</h2>
      </div>
      <Journal
        entries={view.entries}
        mode="in"
        today={today}
        empty="Aucun revenu ce mois-ci. Ajoutez le premier ci-dessus."
        onDelete={remove}
      />
    </>
  );
}

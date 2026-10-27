"use client";

import { useOptimistic, useState, useTransition } from "react";
import { addLine, deleteLine, setPlanned } from "@/app/(app)/actions";
import { IcoTrash } from "@/components/Icons";
import { useToast } from "@/components/Toast";
import type { Line, MonthData } from "@/lib/data";
import { fmt, formatInput, parseAmount, plural } from "@/lib/format";
import { isTemp, lineState, reduce, summary, tempId } from "@/lib/ledger";

export function BudgetView({ data, month }: { data: MonthData; month: string }) {
  const [view, addOp] = useOptimistic(data, reduce);
  const [, startTransition] = useTransition();
  const toast = useToast();
  const [confirm, setConfirm] = useState<string | null>(null);
  const [adding, setAdding] = useState(data.lines.length === 0);

  const income = view.totals.income;
  const { out, rest } = summary(view.totals);
  const planned = view.lines.reduce((a, l) => a + l.planned, 0);
  const budget = view.lines.filter((l) => !l.personId);
  const lent = view.lines.filter((l) => l.direction === "lent");
  const borrowed = view.lines.filter((l) => l.direction === "borrowed");

  function plan(l: Line, input: HTMLInputElement) {
    const v = parseAmount(input.value);
    if (v === l.planned) {
      input.value = l.planned ? fmt(l.planned) : "";
      return;
    }
    // Un budget prévu ne peut pas être baissé sous le montant déjà dépensé du mois (0 = sans plafond)
    if (v && v < l.spent) {
      input.value = l.planned ? fmt(l.planned) : "";
      return toast(`Le budget de « ${l.label} » ne peut pas être inférieur aux ${fmt(l.spent)} FCFA déjà dépensés.`);
    }
    startTransition(async () => {
      addOp({ type: "plan", id: l.id, planned: v });
      const res = await setPlanned({ lineId: l.id, month, planned: v });
      if (!res.ok) input.value = l.planned ? fmt(l.planned) : "";
      toast(res.ok ? `Budget « ${l.label} » : ${fmt(v)} FCFA` : res.error);
    });
  }

  function add(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const form = ev.currentTarget;
    const f = new FormData(form);
    const label = String(f.get("label") ?? "").trim();
    if (!label) return toast("Indiquez un nom de ligne");
    const p = parseAmount(String(f.get("planned") ?? ""));
    form.reset();
    form.querySelector<HTMLInputElement>("input")?.focus();
    startTransition(async () => {
      addOp({
        type: "addLine",
        line: { id: tempId(), label, personId: null, direction: null, planned: p, spent: 0, expense: 0, refund: 0, due: 0 },
      });
      const res = await addLine({ label, planned: p });
      toast(res.ok ? "Ligne ajoutée" : res.error);
    });
  }

  function remove(id: string) {
    setConfirm(null);
    startTransition(async () => {
      addOp({ type: "deleteLine", id });
      const res = await deleteLine(id);
      toast(res.ok ? "Ligne de budget retirée" : res.error);
    });
  }

  const card = (l: Line) => {
    const st = lineState(l);
    if (confirm === l.id)
      return (
        <div className="bline" key={l.id}>
          <div className="bl-top">
            <b>{l.label}</b>
          </div>
          <div className="confirm" style={{ flexWrap: "wrap" }}>
            <span>Retirer cette ligne ? Les dépenses restent dans le journal.</span>
            <button type="button" className="btn sm out" autoFocus onClick={() => remove(l.id)}>
              Retirer
            </button>
            <button type="button" className="btn sm ghost" onClick={() => setConfirm(null)}>
              Annuler
            </button>
          </div>
        </div>
      );
    const msg = {
      over: <span className="bad">Plus d&apos;argent sur cette ligne · dépassement de {fmt(-st.rest)}</span>,
      empty: <span className="bad">Plus d&apos;argent sur cette ligne</span>,
      low: <span className="warn-t">Reste {fmt(st.rest)}</span>,
      ok: <>Reste {fmt(st.rest)}</>,
      free:
        l.direction === "borrowed" ? (
          <>Remboursé ce mois · reste à rendre : {fmt(l.due)}</>
        ) : l.direction === "lent" ? (
          <>
            Dépenses liées : {fmt(l.expense)} · Remboursements : {fmt(l.refund)}
          </>
        ) : (
          <>Aucun montant prévu</>
        ),
    }[st.state];
    const pending = isTemp(l.id);
    return (
      <div className={`bline ${st.state}`} key={l.id}>
        <div className="bl-top">
          <b>{l.label}</b>
          <button
            type="button"
            className="del"
            aria-label={`Retirer la ligne ${l.label}`}
            disabled={pending}
            onClick={() => setConfirm(l.id)}
          >
            <IcoTrash />
          </button>
        </div>
        <div className="bl-grid">
          <div className="cell">
            <label htmlFor={`pl-${l.id}`}>Budget prévu</label>
            <input
              id={`pl-${l.id}`}
              key={`${l.id}-${l.planned}`}
              className="num"
              inputMode="numeric"
              placeholder="0"
              autoComplete="off"
              disabled={pending}
              defaultValue={l.planned ? fmt(l.planned) : ""}
              onInput={(e) => (e.currentTarget.value = formatInput(e.currentTarget.value))}
              onBlur={(e) => plan(l, e.currentTarget)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), e.currentTarget.blur())}
            />
          </div>
          <div className="cell ro">
            <span>{l.direction === "lent" ? "Accordé" : l.direction === "borrowed" ? "Remboursé ce mois" : "Dépensé"}</span>
            <output className="num">{fmt(l.spent)}</output>
          </div>
        </div>
        {l.planned > 0 && (
          <div className="lbar">
            <i className={st.state} style={{ width: `${st.pct}%` }} />
          </div>
        )}
        <div className="bl-msg num">{msg}</div>
      </div>
    );
  };

  return (
    <>
      <section className="sum" aria-label="Synthèse du budget">
        <div>
          <span>Revenus</span>
          <strong className="num" style={{ color: "var(--in)" }}>
            {fmt(income)}
          </strong>
        </div>
        <div>
          <span>Budget prévu</span>
          <strong className="num">{fmt(planned)}</strong>
        </div>
        <div>
          <span>Total dépensé</span>
          <strong className="num" style={{ color: "var(--out)" }}>
            {fmt(out)}
          </strong>
        </div>
        <div>
          <span>Argent restant</span>
          <strong className={`num${rest < 0 ? " bad" : ""}`}>{fmt(rest)}</strong>
        </div>
        {planned > income ? (
          <p className="bad sum-warn">
            Le budget prévu dépasse les revenus de {fmt(planned - income)} FCFA.
          </p>
        ) : (
          <div className="saving">
            <span>Épargne supplémentaire</span>
            <strong className="num">{fmt(income - planned)} FCFA</strong>
            <small>Part des revenus qui n&apos;est affectée à aucune ligne du budget.</small>
          </div>
        )}
      </section>

      <div className="sect">
        <h2>Lignes de budget</h2>
        <span>
          {budget.length} {plural(budget.length, "ligne", "lignes")}
        </span>
      </div>
      {budget.length ? (
        <div className="lines-grid">{budget.map(card)}</div>
      ) : (
        <div className="list">
          <div className="empty">Aucune ligne. Ajoutez par exemple Repas, Transport ou Loyer.</div>
        </div>
      )}
      <details className="add" open={adding} onToggle={(e) => setAdding(e.currentTarget.open)}>
        <summary>+ Ajouter une ligne de budget</summary>
        <form onSubmit={add}>
          <div className="row">
            <div className="field" style={{ flex: "2 1 150px" }}>
              <label htmlFor="b-l">Nom de la ligne</label>
              <input id="b-l" name="label" required maxLength={80} placeholder="Ex. Loyer, Repas…" autoComplete="off" />
            </div>
            <div className="field amount">
              <label htmlFor="b-a">Budget prévu (FCFA)</label>
              <input
                id="b-a"
                name="planned"
                inputMode="numeric"
                placeholder="0"
                autoComplete="off"
                onInput={(e) => (e.currentTarget.value = formatInput(e.currentTarget.value))}
              />
            </div>
          </div>
          <button className="btn" type="submit">
            Ajouter la ligne
          </button>
        </form>
      </details>

      {lent.length > 0 && (
        <>
          <div className="sect">
            <h2>Prêts accordés</h2>
            <span>Liés au volet Prêts</span>
          </div>
          <div className="lines-grid">{lent.map(card)}</div>
        </>
      )}
      {borrowed.length > 0 && (
        <>
          <div className="sect">
            <h2>Remboursements d&apos;emprunts</h2>
            <span>Budget mensuel de remboursement</span>
          </div>
          <div className="lines-grid">{borrowed.map(card)}</div>
        </>
      )}
    </>
  );
}

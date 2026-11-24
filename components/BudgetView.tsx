"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useOptimistic, useState, useTransition } from "react";
import { addLine, deleteLine, setPlanned } from "@/app/(app)/actions";
import { IcoSearch, IcoTrash } from "@/components/Icons";
import { matches } from "@/lib/search";
import { RestSheet } from "@/components/RestSheet";
import { useToast } from "@/components/Toast";
import type { Line, MonthData } from "@/lib/data";
import { fmt, fmtNb, formatInput, parseAmount, plural } from "@/lib/format";
import { isTemp, lineState, reduce, savingSplit, summary, tempId } from "@/lib/ledger";

type Props = {
  data: MonthData;
  month: string;
  /** Période terminée, en cours ou à venir */
  status: "past" | "current" | "future";
  /** Dernier jour d'un mois clôturé (« 21 novembre 2026 ») ; null pour le mois en cours (fin à sa clôture) */
  endLabel: string | null;
  /** « novembre 2026 · 22 oct. – 21 nov. » (titre du détail de l'argent restant) */
  period: string;
};

export function BudgetView({ data, month, status, endLabel, period }: Props) {
  const router = useRouter();
  const [view, addOp] = useOptimistic(data, reduce);
  const [, startTransition] = useTransition();
  const toast = useToast();
  const [confirm, setConfirm] = useState<string | null>(null);
  const [adding, setAdding] = useState(!data.lines.some((l) => !l.system));
  // Recherche dans les lignes (à chaque lettre, sans majuscules ni accents) ; la synthèse reste non filtrée
  const [q, setQ] = useState("");
  const [detail, setDetail] = useState(false);
  const closeDetail = useCallback(() => setDetail(false), []);

  /** Ligne choisie dans le détail : fermer le panneau et faire défiler jusqu'à la ligne, signalée brièvement. */
  function pickLine(id: string) {
    setDetail(false);
    requestAnimationFrame(() => {
      const el = document.getElementById(`line-${id}`);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.remove("flash");
      void el.offsetWidth;
      el.classList.add("flash");
    });
  }

  const income = view.totals.income;
  const { out, rest } = summary(view.totals);
  const planned = view.lines.reduce((a, l) => a + l.planned, 0);
  const budget = view.lines.filter((l) => !l.personId);
  const lent = view.lines.filter((l) => l.direction === "lent");
  // Le report « Reste du mois précédent » compte dans les revenus, jamais comme une nouvelle épargne
  const ownIncome = income - (view.totals.carry ?? 0);
  const { unspent } = savingSplit(ownIncome, planned, out);
  const unspentNote =
    status === "future" || unspent === 0 ? null : unspent < 0 ? (
      <small className="num">
        − dépenses hors budget{status === "current" ? " à ce jour" : ""} : {fmtNb(-unspent)}&nbsp;FCFA
      </small>
    ) : (
      <small className="num">
        + non dépensé{status === "current" ? " à ce jour" : ""} : {fmtNb(unspent)}&nbsp;FCFA ({endLabel ? <>ajouté à la caisse le {endLabel}</> : <>ajouté à la caisse à la clôture du mois</>})
      </small>
    );
  const borrowed = view.lines.filter((l) => l.direction === "borrowed");
  const searching = q.trim() !== "";
  const fBudget = budget.filter((l) => matches(l.label, q));
  const fLent = lent.filter((l) => matches(l.label, q));
  const fBorrowed = borrowed.filter((l) => matches(l.label, q));
  const noMatch = searching && !fBudget.length && !fLent.length && !fBorrowed.length;

  function plan(l: Line, input: HTMLInputElement) {
    const v = parseAmount(input.value);
    if (v === l.planned) {
      input.value = l.planned ? fmt(l.planned) : "";
      return;
    }
    // Un budget prévu ne peut pas être baissé sous le montant déjà dépensé du mois (0 = sans plafond)
    if (v && v < l.spent) {
      input.value = l.planned ? fmt(l.planned) : "";
      return toast(
        `Le budget de « ${l.label} » ne peut pas être inférieur aux ${fmt(l.spent)} FCFA déjà ${l.direction === "lent" ? "accordés" : "dépensés"}.`,
      );
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
        line: { id: tempId(), label, personId: null, direction: null, planned: p, spent: 0, expense: 0, refund: 0, due: 0, loans: 0, pays: 0, system: false, lastUsed: null, recentUses: 0 },
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
      // Seul un changement des dates du mois peut faire dépasser un budget : signalé en orange, sans blocage
      over: <span className="warn-t">Dépassement de {fmt(-st.rest)} FCFA après changement des dates</span>,
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
        ) : l.system ? (
          <>Écarts de rapprochement et dépenses non classées · sans plafond</>
        ) : (
          <>Aucun montant prévu</>
        ),
    }[st.state];
    const pending = isTemp(l.id);
    return (
      <div className={`bline ${st.state === "over" ? "over-dates" : st.state}`} key={l.id} id={`line-${l.id}`}>
        <div className="bl-top">
          <b>{l.label}</b>
          {l.personId ? (
            // Ligne d'une personne : gérée depuis le volet Prêts (pas de retrait ici)
            <Link className="bl-link" href={`/prets/${l.personId}`}>
              Fiche ›
            </Link>
          ) : l.system ? (
            // Ligne système de rapprochement : ni supprimable ni renommable
            <span className="pill">Ligne système</span>
          ) : (
            <button
              type="button"
              className="del"
              aria-label={`Retirer la ligne ${l.label}`}
              disabled={pending}
              onClick={() => setConfirm(l.id)}
            >
              <IcoTrash />
            </button>
          )}
        </div>
        <div className="bl-grid">
          <div className="cell">
            <label htmlFor={`pl-${l.id}`}>Budget prévu</label>
            <input
              id={`pl-${l.id}`}
              key={`${l.id}-${l.planned}`}
              className="num"
              inputMode="numeric"
              autoComplete="off"
              disabled={pending || l.system}
              placeholder={l.system ? "Sans plafond" : "0"}
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
        {(st.state !== "free" || l.direction !== "lent") && <div className="bl-msg num">{msg}</div>}
        {l.direction === "lent" && (
          // Accordé cumulé sur toute la durée : prêts − remboursements
          <div className="bl-msg num">
            Dépenses liées : {fmt(l.expense)} · Remboursements : {fmt(l.refund)}
          </div>
        )}
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
        <button type="button" className="sum-link" aria-haspopup="dialog" onClick={() => setDetail(true)}>
          <span>Argent restant</span>
          <strong className={`num${rest < 0 ? " bad" : ""}`}>{fmt(rest)}</strong>
          <small>Voir le détail ›</small>
        </button>
        {planned > income ? (
          <>
            <p className="bad sum-warn">
              Le budget prévu dépasse les revenus de {fmt(planned - income)} FCFA.
            </p>
            {unspentNote && <div className="saving">{unspentNote}</div>}
          </>
        ) : (
          <div className="saving">
            <span>Épargne supplémentaire</span>
            <strong className="num">{fmt(Math.max(0, ownIncome - planned))} FCFA</strong>
            <small>Part des revenus qui n&apos;est affectée à aucune ligne du budget.</small>
            {unspentNote}
          </div>
        )}
      </section>

      {view.lines.length > 1 && (
        <div className="search" role="search">
          <IcoSearch />
          <input
            type="search"
            aria-label="Rechercher une ligne"
            placeholder="Rechercher une ligne…"
            autoComplete="off"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setQ("")}
          />
          {q && (
            <button type="button" className="search-clear" aria-label="Effacer la recherche" onClick={() => setQ("")}>
              ×
            </button>
          )}
        </div>
      )}
      {noMatch && (
        <div className="list">
          <div className="empty">Aucune ligne ne correspond à « {q.trim()} ».</div>
        </div>
      )}

      {(!searching || fBudget.length > 0) && (
        <>
          <div className="sect">
            <h2>Lignes de budget</h2>
            <span>
              {searching
                ? `${fBudget.length} ${plural(fBudget.length, "résultat", "résultats")}`
                : `${budget.filter((l) => !l.system).length} ${plural(budget.filter((l) => !l.system).length, "ligne", "lignes")}`}
            </span>
          </div>
          {fBudget.length ? (
            <div className="lines-grid">{fBudget.map(card)}</div>
          ) : (
            <div className="list">
              <div className="empty">Aucune ligne. Ajoutez par exemple Repas, Transport ou Loyer.</div>
            </div>
          )}
        </>
      )}
      <details className="add" hidden={searching} open={adding} onToggle={(e) => setAdding(e.currentTarget.open)}>
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

      {fLent.length > 0 && (
        <>
          <div className="sect">
            <h2>Prêts accordés</h2>
            <span>Liés au volet Prêts</span>
          </div>
          <div className="lines-grid">{fLent.map(card)}</div>
        </>
      )}
      {fBorrowed.length > 0 && (
        <>
          <div className="sect">
            <h2>Remboursements d&apos;emprunts</h2>
            <span>Budget mensuel de remboursement</span>
          </div>
          <div className="lines-grid">{fBorrowed.map(card)}</div>
        </>
      )}
      {detail && <RestSheet data={view} period={period} onClose={closeDetail} onPick={pickLine} />}
    </>
  );
}

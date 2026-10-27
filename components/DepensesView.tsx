"use client";

import Link from "next/link";
import { useMemo, useOptimistic, useRef, useState, useTransition } from "react";
import { addExpense, deleteTransaction } from "@/app/(app)/actions";
import { CategoryFilter } from "@/components/CategoryFilter";
import { IcoPrint, IcoWarn } from "@/components/Icons";
import { Journal } from "@/components/Journal";
import { useToast } from "@/components/Toast";
import { printOrShare } from "@/lib/print";
import { Brand } from "@/components/Brand";
import type { Entry, MonthData } from "@/lib/data";
import { fmt, formatInput, parseAmount, plural } from "@/lib/format";
import { checkExpense, defaultLabel, isExhausted, lineGroups, reduce, stamp, summary, tempId } from "@/lib/ledger";

type Props = { data: MonthData; month: string; monthName: string; today: string; tz: string; budgetHref: string; revenusHref: string };

export function DepensesView({ data, month, monthName, today, tz, budgetHref, revenusHref }: Props) {
  const [view, addOp] = useOptimistic(data, reduce);
  const [, startTransition] = useTransition();
  const toast = useToast();

  const [amount, setAmount] = useState("");
  const [label, setLabel] = useState("");
  const [lineId, setLineId] = useState<string | null>(null);
  const [alert, setAlert] = useState<{ label: string; planned: number } | null>(null);
  const [filter, setFilter] = useState<string | null>(null);
  const amountRef = useRef<HTMLInputElement>(null);


  const line = view.lines.find((l) => l.id === lineId) ?? view.lines[0];
  const amt = parseAmount(amount);
  const check = checkExpense(line, amt);
  const { inflow, out, rest, pct } = summary(view.totals);
  const dry = view.lines.filter(isExhausted).length;

  const filterLine = filter ? view.lines.find((l) => l.id === filter) : undefined;
  const activeFilter = filterLine ? filter : null;
  const entries = useMemo(
    () => view.entries.filter((e) => !activeFilter || e.lineId === activeFilter),
    [view.entries, activeFilter],
  );
  const filtered = entries.reduce((a, e) => a + (e.kind === "refund" ? -e.amount : e.amount), 0);
  const cur = filterLine?.label ?? "Toutes les catégories";

  function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!line) return;
    if (!amt) return toast("Saisissez un montant");
    if (!check.ok) return toast(line.planned && line.spent >= line.planned ? "Budget déjà atteint sur cette ligne" : "Montant supérieur au reste de la ligne");
    const { day, time } = stamp(month, tz);
    const entry: Entry = {
      id: tempId(),
      kind: "expense",
      amount: amt,
      label: label.trim() || defaultLabel(line),
      lineId: line.id,
      lineLabel: line.label,
      direction: line.direction,
      personName: line.personId ? line.label : null,
      day,
      time,
      at: new Date().toISOString(),
    };
    const sent = { month, amount: amt, label, lineId: line.id };
    const spentAfter = line.spent + amt;
    setAmount("");
    setLabel("");
    amountRef.current?.focus();
    setAlert(line.planned && spentAfter >= line.planned ? { label: line.label, planned: line.planned } : null);
    startTransition(async () => {
      addOp({ type: "add", entry });
      const res = await addExpense(sent);
      if (!res.ok) {
        setAlert(null);
        toast(res.error);
      } else if (line.direction === "lent") toast(`${fmt(amt)} FCFA ajoutés aux prêts de ${line.label}`);
      else if (line.direction === "borrowed") toast(`${fmt(amt)} FCFA remboursés à ${line.label}`);
      else toast(`−${fmt(amt)} FCFA sur « ${line.label} »`);
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
    <div className="cols">
      <div className="noprint stack col">
        <section className="hero" aria-label="Reste disponible">
          <div className="lbl">Reste disponible</div>
          <div className={`big num${rest < 0 ? " neg" : ""}`}>
            {fmt(rest)}
            <small>FCFA</small>
          </div>
          <div className="bar" role="img" aria-label={`${pct} % des revenus dépensés`}>
            <i className={pct >= 100 ? "over" : pct >= 80 ? "warn" : ""} style={{ width: `${Math.min(Math.max(pct, 0), 100)}%` }} />
          </div>
          <div className="pct num">{pct} % des revenus du mois dépensés</div>
          <div className="split">
            <div>
              <span>
                Revenus
                {view.totals.borrow > 0 && <small className="num"> (dont {fmt(view.totals.borrow)} empruntés)</small>}
              </span>
              <strong className="num">+{fmt(inflow)}</strong>
            </div>
            <div>
              <span>Dépenses</span>
              <strong className="num">−{fmt(out)}</strong>
            </div>
          </div>
          {view.debts > 0 && (
            <Link className="hero-link" href="/prets?sens=emprunte">
              <span>
                Dettes en cours : <b className="num">{fmt(view.debts)} FCFA</b>
              </span>
              <span>Voir ›</span>
            </Link>
          )}
          {dry > 0 && (
            <Link className="hero-link" href={budgetHref}>
              <span>
                <b>
                  {dry} {plural(dry, "ligne", "lignes")} de budget {plural(dry, "épuisée", "épuisées")}
                </b>
              </span>
              <span>Voir le budget ›</span>
            </Link>
          )}
        </section>

        {view.lines.length === 0 ? (
          <div className="quick welcome">
            <h2>Bienvenue dans Mawnytrack</h2>
            <p className="hint">Pour commencer :</p>
            <ol>
              <li>
                Créez une première <b>ligne de budget</b> (par exemple Repas, Transport ou Loyer) dans la section Budget :
                chaque dépense y sera classée.
              </li>
              <li>
                Enregistrez un premier <b>revenu</b> dans la section Revenus : le reste disponible du mois se calcule à
                partir des revenus.
              </li>
            </ol>
            <Link className="btn" href={budgetHref}>
              Créer une ligne de budget
            </Link>
            <Link className="btn ghost" href={revenusHref}>
              Ajouter un revenu
            </Link>
          </div>
        ) : (
          <form className="quick" aria-label="Nouvelle sortie d'argent" onSubmit={submit}>
            <div className="field amount">
              <label htmlFor="q-amt">Montant (FCFA)</label>
              <input
                id="q-amt"
                ref={amountRef}
                inputMode="numeric"
                placeholder="0"
                autoComplete="off"
                required
                value={amount}
                onChange={(e) => setAmount(formatInput(e.target.value))}
              />
            </div>
            <div className="row">
              <div className="field" style={{ flex: "3 1 150px" }}>
                <label htmlFor="q-lbl">Libellé</label>
                <input
                  id="q-lbl"
                  placeholder="Ex. taxi, déjeuner…"
                  autoComplete="off"
                  maxLength={120}
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                />
              </div>
              <div className="field" style={{ flex: "2 1 150px" }}>
                <label htmlFor="q-cat">Ligne de budget</label>
                <select id="q-cat" value={line?.id} onChange={(e) => setLineId(e.target.value)}>
                  {lineGroups(view.lines).map((g) =>
                    g.lines.length ? (
                      <optgroup key={g.name} label={g.name}>
                        {g.lines.map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.label}
                          </option>
                        ))}
                      </optgroup>
                    ) : null,
                  )}
                </select>
              </div>
            </div>
            <div className="hint num" id="q-hint" aria-live="polite">
              {check.bad ? <span className="bad">{check.hint}</span> : check.hint}
            </div>
            <button className="btn out" type="submit" disabled={!check.ok}>
              Enregistrer la sortie
            </button>
          </form>
        )}

        {alert && (
          <div className="alert" role="alert">
            <IcoWarn />
            <div>
              <b>Plus d&apos;argent sur la ligne « {alert.label} »</b>
              <span>Les {fmt(alert.planned)} FCFA prévus sont entièrement dépensés.</span>
            </div>
            <button type="button" className="del" aria-label="Fermer le message" onClick={() => setAlert(null)}>
              ×
            </button>
          </div>
        )}
      </div>

      <div className="col">
        <div className="printonly">
          <Brand size={22} style={{ fontSize: 18 }} />
          <b>
            Sorties de {monthName} · {cur}
          </b>
        </div>
        <div className="sect">
          <h2>Sorties du mois</h2>
          <span className="num">
            {entries.length} {plural(entries.length, "ligne", "lignes")} · {fmt(filtered)} FCFA
          </span>
        </div>
        <div className="ftools noprint">
          <CategoryFilter lines={view.lines} value={activeFilter} onChange={setFilter} />
          <button
            type="button"
            className="iconbtn"
            aria-label={`Imprimer ${cur}`}
            title="Imprimer l'affichage"
            onClick={() =>
            printOrShare({
              pdfUrl: `/depenses/pdf?m=${month}${activeFilter ? `&ligne=${activeFilter}` : ""}`,
              filename: `sorties-${month}.pdf`,
              title: `Sorties de ${monthName} · ${cur}`,
              notify: toast,
            })
          }
          >
            <IcoPrint />
          </button>
        </div>
        <Journal
          entries={entries}
          mode="out"
          today={today}
          empty={activeFilter ? "Aucune sortie dans cette catégorie ce mois-ci." : "Aucune sortie ce mois-ci. La première saisie apparaîtra ici."}
          onDelete={remove}
        />
        <div className="printonly ptotal">
          <span>Total {cur}</span>
          <b className="num">{fmt(filtered)} FCFA</b>
        </div>
      </div>
    </div>
  );
}

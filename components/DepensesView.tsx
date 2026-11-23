"use client";

import Link from "next/link";
import { useMemo, useOptimistic, useRef, useState, useTransition } from "react";
import { addExpense, addIncome, deleteTransaction, updateEntry } from "@/app/(app)/actions";
import { CategoryFilter } from "@/components/CategoryFilter";
import { IcoPrint } from "@/components/Icons";
import { Journal } from "@/components/Journal";
import type { MoveEdit } from "@/components/MoveEditForm";
import { updateMove } from "@/app/(app)/prets/actions";
import { useToast } from "@/components/Toast";
import { currentPeriod, longDate, periodOf, type PeriodSettings } from "@/lib/period";
import { ReconcileSheet } from "@/components/ReconcileSheet";
import { PdfPreview } from "@/components/PdfPreview";
import { sortiesFilename } from "@/lib/statement";
import { Brand } from "@/components/Brand";
import type { Entry, MonthData } from "@/lib/data";
import { fmt, formatInput, parseAmount, plural } from "@/lib/format";
import { checkExpense, defaultLabel, entryEditCheck, isMove, isExhausted, lineGroups, reduce, stamp, summary, tempId } from "@/lib/ledger";

type Props = {
  data: MonthData;
  month: string;
  /** Nom de la période (« novembre 2026 ») et titre avec ses dates (« novembre 2026 (22 oct. – 21 nov.) ») */
  monthName: string;
  monthTitle: string;
  today: string;
  tz: string;
  ps: PeriodSettings;
  budgetHref: string;
  revenusHref: string;
};

export function DepensesView({ data, month, monthName, monthTitle, today, tz, ps, budgetHref, revenusHref }: Props) {
  const [view, addOp] = useOptimistic(data, reduce);
  const [, startTransition] = useTransition();
  const toast = useToast();

  const [amount, setAmount] = useState("");
  const [label, setLabel] = useState("");
  const [lineId, setLineId] = useState<string | null>(null);
  const [filter, setFilter] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const [reconcile, setReconcile] = useState(false);
  const isCurrent = month === currentPeriod(ps, tz);
  const unlisted = view.lines.find((l) => l.system);
  const amountRef = useRef<HTMLInputElement>(null);


  const line = view.lines.find((l) => l.id === lineId) ?? view.lines[0];
  const amt = parseAmount(amount);
  const check = checkExpense(line, amt);
  const { inflow, out, rest, pct } = summary(view.totals);
  const dry = view.lines.filter(isExhausted).length;

  const filterLine = filter ? view.lines.find((l) => l.id === filter) : undefined;
  const activeFilter = filterLine ? filter : null;
  const entries = useMemo(
    // Journal des sorties : dépenses et remboursements reçus (une entrée de rapprochement n'y figure pas)
    () => view.entries.filter((e) => (e.kind === "expense" || e.kind === "refund") && (!activeFilter || e.lineId === activeFilter)),
    [view.entries, activeFilter],
  );
  const filtered = entries.reduce((a, e) => a + (e.kind === "refund" ? -e.amount : e.amount), 0);
  const cur = filterLine?.label ?? "Toutes les catégories";

  function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!line) return;
    if (!amt) return toast("Saisissez un montant");
    if (!check.ok) return toast(line.planned && line.spent >= line.planned ? "Budget déjà atteint sur cette ligne" : "Montant supérieur au reste de la ligne");
    const { day, time } = stamp(month, tz, ps);
    const entry: Entry = {
      id: tempId(),
      kind: "expense",
      amount: amt,
      label: label.trim() || defaultLabel(line),
      lineId: line.id,
      lineLabel: line.label,
      direction: line.direction,
      personId: line.personId,
      personName: line.personId ? line.label : null,
      day,
      time,
      at: new Date().toISOString(),
    };
    const sent = { month, amount: amt, label, lineId: line.id };
    setAmount("");
    setLabel("");
    amountRef.current?.focus();
    startTransition(async () => {
      addOp({ type: "add", entry });
      const res = await addExpense(sent);
      if (!res.ok) toast(res.error);
      else if (line.direction === "lent") toast(`${fmt(amt)} FCFA ajoutés aux prêts de ${line.label}`);
      else if (line.direction === "borrowed") toast(`${fmt(amt)} FCFA remboursés à ${line.label}`);
      else toast(`−${fmt(amt)} FCFA sur « ${line.label} »`);
    });
  }

  /** Modification d'un mouvement : prêt, emprunt, remboursement, revenu ou dépense non répertoriée. */
  function edit(e: Entry, v: MoveEdit) {
    const keep = periodOf(v.date, ps) === month;
    startTransition(async () => {
      addOp({ type: "edit", keep, entry: { ...e, amount: v.amount, label: v.label || e.label, day: v.date } });
      const res = isMove(e) ? await updateMove({ id: e.id, ...v }) : await updateEntry({ id: e.id, ...v });
      toast(res.ok ? (keep ? "Modification enregistrée" : "Modification enregistrée : mouvement déplacé dans une autre période") : res.error);
    });
  }

  /**
   * Rapprochement : l'écart entre le reste disponible et l'argent réel est enregistré comme dépense sur la ligne
   * « Dépenses non répertoriées » (par le chemin habituel addExpense : cette ligne n'a pas de plafond) ou comme
   * entrée non répertoriée (revenu). Le reste disponible devient égal à l'argent réel saisi.
   */
  function reconcileWith(kind: "expense" | "income", amt: number) {
    if (!unlisted) return;
    setReconcile(false);
    const real = rest + (kind === "income" ? amt : -amt);
    const { day, time } = stamp(month, tz, ps);
    const label =
      kind === "expense" ? `Rapprochement du ${longDate(today)}` : `Entrée non répertoriée — rapprochement du ${longDate(today)}`;
    const entry: Entry = {
      id: tempId(),
      kind,
      amount: amt,
      label,
      lineId: kind === "expense" ? unlisted.id : null,
      lineLabel: kind === "expense" ? unlisted.label : null,
      direction: null,
      personId: null,
      personName: null,
      day,
      time,
      at: new Date().toISOString(),
    };
    startTransition(async () => {
      addOp({ type: "add", entry });
      const res =
        kind === "expense"
          ? await addExpense({ month, amount: amt, label, lineId: unlisted.id })
          : await addIncome({ month, amount: amt, label });
      toast(res.ok ? `Rapprochement enregistré : reste disponible ${fmt(real)} FCFA` : res.error);
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
          {isCurrent && unlisted && (
            <button type="button" className="hero-link" aria-haspopup="dialog" onClick={() => setReconcile(true)}>
              <span>Rapprocher avec mon argent réel</span>
              <span>›</span>
            </button>
          )}
        </section>

        {!view.lines.some((l) => !l.system) ? (
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
      </div>

      <div className="col">
        <div className="printonly">
          <Brand size={22} style={{ fontSize: 18 }} />
          <b>
            Sorties de {monthTitle} · {cur}
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
            aria-label={`Imprimer ou partager : ${cur}`}
            title="Imprimer ou partager l'affichage"
            onClick={() => setPreview(true)}
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
          editCheck={(e, amount, date) => entryEditCheck(view, e, amount, date, month, ps)}
          onEdit={edit}
        />
        <div className="printonly ptotal">
          <span>Total {cur}</span>
          <b className="num">{fmt(filtered)} FCFA</b>
        </div>
      </div>
      {reconcile && (
        <ReconcileSheet
          rest={rest}
          onClose={() => setReconcile(false)}
          onExpense={(a) => reconcileWith("expense", a)}
          onIncome={(a) => reconcileWith("income", a)}
        />
      )}
      {preview && (
        <PdfPreview
          pdfUrl={`/depenses/pdf?m=${month}${activeFilter ? `&ligne=${activeFilter}` : ""}`}
          filename={sortiesFilename(monthName, filterLine?.label)}
          title={`Sorties de ${monthTitle} · ${cur}`}
          onClose={() => setPreview(false)}
        />
      )}
    </div>
  );
}

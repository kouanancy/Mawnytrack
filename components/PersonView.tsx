"use client";

import Link from "next/link";
import { useOptimistic, useTransition } from "react";
import { addBorrow, addRefund } from "@/app/(app)/prets/actions";
import { IcoBack, IcoPrint } from "@/components/Icons";
import { useToast } from "@/components/Toast";
import { fmt, formatInput, parseAmount } from "@/lib/format";
import { tempId } from "@/lib/ledger";
import type { Movement, Person } from "@/lib/loans";
import { localDayTime } from "@/lib/month";

type State = { person: Person; history: Movement[] };

function reduce(s: State, m: Movement): State {
  const p = s.person;
  const total = p.total + (m.type === "loan" ? m.amount : 0);
  const back = p.back + (m.type === "pay" ? m.amount : 0);
  return { person: { ...p, total, back, due: Math.max(0, total - back) }, history: [m, ...s.history] };
}

const dfmt = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
};

/** Fiche d'une personne : totaux, formulaire selon le sens, historique du plus récent au plus ancien. */
export function PersonView({ data, today, tz }: { data: State; today: string; tz: string }) {
  const [view, apply] = useOptimistic(data, reduce);
  const [, startTransition] = useTransition();
  const toast = useToast();
  const { person: p, history } = view;
  const L = p.direction === "lent";
  const back = L ? "/prets" : "/prets?sens=emprunte";

  function movement(type: Movement["type"], amount: number, label: string, day: string): Movement {
    return { id: tempId(), type, amount, label, day, time: localDayTime(new Date(), tz).time };
  }

  function onBorrow(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const amount = parseAmount(String(f.get("amount") ?? ""));
    if (!amount) return toast("Saisissez un montant");
    const label = String(f.get("label") ?? "").trim() || "Emprunt";
    form.reset();
    startTransition(async () => {
      apply(movement("loan", amount, label, today));
      const r = await addBorrow({ personId: p.id, amount, label });
      toast(r.ok ? `${fmt(amount)} FCFA empruntés à ${p.name}` : r.error);
    });
  }

  function onRefund(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const amount = parseAmount(String(f.get("amount") ?? ""));
    if (!amount) return toast("Saisissez un montant");
    if (amount > p.due) return toast(`Montant supérieur au reste dû par ${p.name} (${fmt(p.due)} FCFA)`);
    const date = String(f.get("date") ?? "") || today;
    form.reset();
    startTransition(async () => {
      apply(movement("pay", amount, `Remboursement de ${p.name}`, date));
      const r = await addRefund({ personId: p.id, amount, date });
      toast(r.ok ? (p.due - amount <= 0 ? "Prêt soldé" : "Remboursement enregistré") : r.error);
    });
  }

  const sorted = [...history].sort((a, b) => (b.day + b.time).localeCompare(a.day + a.time));

  return (
    <>
      <div className="phead-bar">
        <Link className="btn ghost sm" href={back}>
          <IcoBack /> Prêts
        </Link>
        <Link className="iconbtn" href={`/prets/${p.id}/releve`} aria-label="Relevé mensuel à imprimer" title="Relevé mensuel à imprimer">
          <IcoPrint />
        </Link>
      </div>
      <div className="cols">
        <div className="stack col">
          <section className="phead">
            <div className="avatar lg" aria-hidden="true">
              {p.name.trim().slice(0, 1).toUpperCase()}
            </div>
            <div>
              <h1>{p.name}</h1>
              <span>{L ? "Argent prêté" : "Argent emprunté"}</span>
            </div>
            {p.due <= 0 ? <span className="pill ok">Soldé</span> : <span className="pill run">En cours</span>}
          </section>
          <div className="sum three">
            <div>
              <span>{L ? "Total prêté" : "Total emprunté"}</span>
              <strong className="num">{fmt(p.total)}</strong>
            </div>
            <div>
              <span>Remboursé</span>
              <strong className="num" style={{ color: "var(--in)" }}>
                {fmt(p.back)}
              </strong>
            </div>
            <div>
              <span>{L ? "Reste dû" : "Reste à rendre"}</span>
              <strong className="num" style={{ color: "var(--out)" }}>
                {fmt(p.due)}
              </strong>
            </div>
          </div>
          <div className="actions">
            {!L && (
              <details className="add" open>
                <summary>+ Enregistrer un nouvel emprunt</summary>
                <form onSubmit={onBorrow}>
                  <div className="row">
                    <div className="field amount">
                      <label htmlFor="bw-a">Montant reçu (FCFA)</label>
                      <input
                        id="bw-a"
                        name="amount"
                        inputMode="numeric"
                        required
                        placeholder="0"
                        autoComplete="off"
                        onInput={(e) => (e.currentTarget.value = formatInput(e.currentTarget.value))}
                      />
                    </div>
                    <div className="field" style={{ flex: "2 1 150px" }}>
                      <label htmlFor="bw-l">Libellé</label>
                      <input id="bw-l" name="label" maxLength={120} placeholder="Ex. dépannage, avance…" autoComplete="off" />
                    </div>
                  </div>
                  <p className="hint">
                    Le montant s&apos;ajoute aux revenus du mois et à la somme à rendre. Les remboursements se saisissent
                    côté Dépenses, sur la ligne « {p.name} ».
                  </p>
                  <button className="btn" type="submit">
                    Enregistrer l&apos;emprunt
                  </button>
                </form>
              </details>
            )}
            {L && p.due > 0 && (
              <details className="add" open>
                <summary>+ Enregistrer un remboursement</summary>
                <form onSubmit={onRefund}>
                  <div className="row">
                    <div className="field amount">
                      <label htmlFor="rp-a">Montant reçu (FCFA)</label>
                      <input
                        id="rp-a"
                        name="amount"
                        inputMode="numeric"
                        required
                        placeholder="0"
                        autoComplete="off"
                        onInput={(e) => (e.currentTarget.value = formatInput(e.currentTarget.value))}
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="rp-d">Date</label>
                      <input id="rp-d" name="date" type="date" defaultValue={today} max={today} />
                    </div>
                  </div>
                  <p className="hint">
                    Le montant réduit la créance (au plus {fmt(p.due)} FCFA) et vient en déduction de la ligne de budget
                    à son nom.
                  </p>
                  <button className="btn" type="submit">
                    Valider le remboursement
                  </button>
                </form>
              </details>
            )}
            {L && (
              <p className="hint">Les nouveaux prêts se saisissent côté Dépenses, sur la ligne « {p.name} ».</p>
            )}
          </div>
        </div>
        <div className="col">
          <div className="sect">
            <h2>Historique</h2>
            <span>Du plus récent au plus ancien</span>
          </div>
          <div className="list">
            {sorted.length ? (
              sorted.map((h) => (
                <div className={`item${h.id.startsWith("tmp-") ? " fresh" : ""}`} key={h.id}>
                  <div className={`ico ${h.type === "loan" ? "o" : "i"}`} aria-hidden="true">
                    {h.type === "loan" ? (L ? "↗" : "↙") : "✓"}
                  </div>
                  <div className="meta">
                    <b>{h.label || (h.type === "loan" ? (L ? "Prêt" : "Emprunt") : "Remboursement")}</b>
                    <span>
                      {dfmt(h.day)} · {h.time} · {h.type === "loan" ? (L ? "Prêt" : "Emprunt") : "Remboursement"}
                    </span>
                  </div>
                  <div className={`amt num${h.type === "pay" ? " i" : ""}`}>{fmt(h.amount)}</div>
                </div>
              ))
            ) : (
              <div className="empty">Aucun mouvement.</div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

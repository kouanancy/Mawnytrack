"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useOptimistic, useState, useTransition } from "react";
import {
  addProjectOut,
  closeProject,
  deleteProject,
  deleteProjectMove,
  fundProject,
  setTarget,
  updateProjectMove,
} from "@/app/(app)/investissements/actions";
import { IcoBack, IcoPrint, IcoTrash } from "@/components/Icons";
import { kindName } from "@/components/InvestView";
import { MoveEditForm } from "@/components/MoveEditForm";
import { useToast } from "@/components/Toast";
import type { Project, ProjectMove } from "@/lib/caisse";
import { fmt, fmtNb, formatInput, parseAmount } from "@/lib/format";
import { isTemp, tempId } from "@/lib/ledger";
import { localDayTime } from "@/lib/month";
import { checkProjectMove, moveName, projectStatus, type CashState, type MoveType } from "@/lib/project-cash";

type Data = { project: Project; moves: ProjectMove[]; available: number };
type Op =
  | { type: "add"; move: ProjectMove }
  | { type: "edit"; move: ProjectMove }
  | { type: "delete"; id: string }
  | { type: "target"; target: number }
  | { type: "close"; move: ProjectMove | null };

const byDate = (a: ProjectMove, b: ProjectMove) => (b.day + b.time).localeCompare(a.day + a.time);

function reduce(s: Data, op: Op): Data {
  switch (op.type) {
    case "add":
      return { ...s, moves: [op.move, ...s.moves].sort(byDate) };
    case "edit":
      return { ...s, moves: s.moves.map((m) => (m.id === op.move.id ? op.move : m)).sort(byDate) };
    case "delete":
      return { ...s, moves: s.moves.filter((m) => m.id !== op.id) };
    case "target":
      return { ...s, project: { ...s.project, target: op.target } };
    case "close":
      return { ...s, project: { ...s.project, closed: true }, moves: op.move ? [op.move, ...s.moves] : s.moves };
  }
}

/** Totaux recalculés depuis les mouvements (affichage instantané des mises à jour optimistes). */
function totals(moves: ProjectMove[]) {
  const sum = (t: MoveType) => moves.filter((m) => m.type === t).reduce((a, m) => a + m.amount, 0);
  const fund = sum("fund"), spent = sum("out"), back = sum("back");
  return { allocated: fund - back, spent, back, balance: fund - back - spent };
}

const dfmt = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
};

const deleteNotice: Record<MoveType, string> = {
  fund: "Le montant retournera dans la caisse principale.",
  out: "Le montant reviendra dans la caisse du projet.",
  back: "Le montant reviendra dans la caisse du projet.",
};

/**
 * Fiche d'un élément de type « Projet » : caisse propre, approvisionnée depuis la caisse principale.
 * Totaux (alloué, dépensé, solde), montant nécessaire et jauge, approvisionnement, sorties, mouvements
 * modifiables, rapport, clôture et suppression. Contrôles pendant la saisie (checkProjectMove) et côté serveur.
 */
export function ProjectCashView({ data, today, tz }: { data: Data; today: string; tz: string }) {
  const router = useRouter();
  const [view, apply] = useOptimistic(data, reduce);
  const [, startTransition] = useTransition();
  const toast = useToast();
  const [fundAmt, setFundAmt] = useState("");
  const [fundLabel, setFundLabel] = useState("");
  const [outAmt, setOutAmt] = useState("");
  const [outLabel, setOutLabel] = useState("");
  const [fundOpen, setFundOpen] = useState(data.project.engaged === 0);
  const [done, setDone] = useState<{ amount: number; label: string; balance: number; id: string | null } | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [ask, setAsk] = useState<"close" | "delete" | null>(null);

  const { project: p, moves } = view;
  const t = totals(moves);
  // Disponible de la caisse principale, corrigé des opérations en attente
  const available = view.available - (t.allocated - totals(data.moves).allocated);
  const state: CashState = { target: p.target, allocated: t.allocated, balance: t.balance, available, closed: p.closed };
  const status = projectStatus({ closed: p.closed, engaged: t.allocated });
  const rest = Math.max(0, p.target - t.allocated);
  const pct = p.target ? Math.min(100, (t.allocated / p.target) * 100) : 0;
  const report = `/investissements/${p.id}/rapport`;

  const fAmt = parseAmount(fundAmt);
  const fCheck = checkProjectMove(state, "fund", 0, fAmt);
  const oAmt = parseAmount(outAmt);
  const oCheck = checkProjectMove(state, "out", 0, oAmt);
  // Caisse du projet vide : message affiché dès l'ouverture, sans attendre la saisie
  const oEmpty = t.balance <= 0 ? checkProjectMove(state, "out", 0, 1) : null;

  function newMove(type: MoveType, amount: number, label: string): ProjectMove {
    const { day, time } = localDayTime(new Date(), tz);
    return { id: tempId(), type, amount, label, day, time };
  }

  function target(input: HTMLInputElement) {
    const v = parseAmount(input.value);
    const reset = () => (input.value = fmt(p.target));
    if (v === p.target) return reset();
    if (!v || v < t.allocated) {
      reset();
      return toast(`Le montant nécessaire ne peut pas être inférieur aux ${fmt(t.allocated)} FCFA déjà alloués`);
    }
    startTransition(async () => {
      apply({ type: "target", target: v });
      const r = await setTarget({ id: p.id, target: v });
      if (!r.ok) reset();
      toast(r.ok ? "Montant nécessaire mis à jour" : r.error);
    });
  }

  function fund(e: React.FormEvent) {
    e.preventDefault();
    if (!fAmt) return toast("Saisissez un montant");
    if (!fCheck.ok) return toast(fCheck.hint);
    const label = fundLabel.trim() || "Approvisionnement depuis la caisse";
    setFundAmt("");
    setFundLabel("");
    startTransition(async () => {
      apply({ type: "add", move: newMove("fund", fAmt, label) });
      const r = await fundProject({ projectId: p.id, amount: fAmt, label });
      toast(r.ok ? `${fmt(fAmt)} FCFA ajoutés à la caisse du projet` : r.error);
    });
  }

  function out(e: React.FormEvent) {
    e.preventDefault();
    if (!oAmt) return toast("Saisissez un montant");
    if (!oCheck.ok) return toast(oCheck.hint);
    const label = outLabel.trim() || "Sortie";
    const balance = t.balance - oAmt;
    setOutAmt("");
    setOutLabel("");
    setDone({ amount: oAmt, label, balance, id: null });
    startTransition(async () => {
      apply({ type: "add", move: newMove("out", oAmt, label) });
      const r = await addProjectOut({ projectId: p.id, amount: oAmt, label });
      if (!r.ok) {
        setDone(null);
        return toast(r.error);
      }
      setDone({ amount: oAmt, label, balance: r.balance ?? balance, id: r.id ?? null });
      toast(`Sortie enregistrée : ${fmt(oAmt)} FCFA`);
    });
  }

  function edit(m: ProjectMove, v: { amount: number; label: string; date: string }) {
    startTransition(async () => {
      apply({ type: "edit", move: { ...m, amount: v.amount, label: v.label || m.label, day: v.date } });
      const r = await updateProjectMove({ id: m.id, ...v });
      toast(r.ok ? "Modification enregistrée" : r.error);
    });
  }

  function remove(m: ProjectMove) {
    setConfirm(null);
    startTransition(async () => {
      apply({ type: "delete", id: m.id });
      const r = await deleteProjectMove(m.id);
      toast(r.ok ? "Mouvement supprimé" : r.error);
    });
  }

  function close() {
    if (ask !== "close") return setAsk("close");
    setAsk(null);
    const back = t.balance > 0 ? newMove("back", t.balance, "Restitution à la caisse (clôture)") : null;
    startTransition(async () => {
      apply({ type: "close", move: back });
      const r = await closeProject(p.id);
      toast(r.ok ? `Projet clôturé${back ? ` : ${fmt(back.amount)} FCFA rendus à la caisse` : ""}` : r.error);
    });
  }

  function removeProject() {
    if (ask !== "delete") return setAsk("delete");
    startTransition(async () => {
      const r = await deleteProject(p.id);
      if (!r.ok) return toast(r.error);
      toast("Projet supprimé, argent alloué rendu à la caisse");
      router.replace("/investissements");
    });
  }

  const amountText = (m: ProjectMove) => (m.type === "fund" ? `+${fmt(m.amount)}` : m.type === "out" ? `−${fmt(m.amount)}` : fmt(m.amount));

  return (
    <>
      <div className="phead-bar">
        <Link className="btn ghost sm" href="/investissements">
          <IcoBack /> Investissements
        </Link>
        <Link className="iconbtn" href={report} aria-label="Rapport complet du projet" title="Rapport complet du projet">
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
              <span>{kindName(p.kind)}</span>
            </div>
            <span className={`pill ${status[0]}`}>{status[1]}</span>
          </section>
          <div className="sum three">
            <div>
              <span>Alloué</span>
              <strong className="num">{fmt(t.allocated)}</strong>
            </div>
            <div>
              <span>Dépensé</span>
              <strong className="num" style={{ color: "var(--out)" }}>
                {fmt(t.spent)}
              </strong>
            </div>
            <div>
              <span>Solde du projet</span>
              <strong className="num" style={{ color: "var(--in)" }}>
                {fmt(t.balance)}
              </strong>
            </div>
          </div>
          <div className="bline">
            <div className="bl-grid">
              <div className="cell">
                <label htmlFor="pt">Montant nécessaire</label>
                <input
                  id="pt"
                  key={p.target}
                  className="num"
                  inputMode="numeric"
                  autoComplete="off"
                  disabled={p.closed}
                  defaultValue={fmt(p.target)}
                  onInput={(e) => (e.currentTarget.value = formatInput(e.currentTarget.value))}
                  onBlur={(e) => target(e.currentTarget)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), e.currentTarget.blur())}
                />
              </div>
              <div className="cell ro">
                <span>Alloué</span>
                <output className="num">{fmt(t.allocated)}</output>
              </div>
            </div>
            <div className="lbar">
              <i style={{ width: `${pct}%` }} />
            </div>
            <div className="bl-msg num">
              Alloué {fmt(t.allocated)} / nécessaire {fmt(p.target)}
              {!p.closed && (rest ? <> · reste à financer : {fmt(rest)} FCFA</> : <span className="ok-t"> · entièrement alloué</span>)}
            </div>
          </div>

          {p.closed ? (
            <p className="hint">Projet clôturé : lecture seule. Le solde a été rendu à la caisse principale.</p>
          ) : (
            <>
              <details className="add" open={fundOpen} onToggle={(e) => setFundOpen(e.currentTarget.open)}>
                <summary>+ Approvisionner depuis la caisse</summary>
                <form onSubmit={fund}>
                  <div className="row">
                    <div className="field amount">
                      <label htmlFor="pf-a">Montant (FCFA)</label>
                      <input
                        id="pf-a"
                        inputMode="numeric"
                        placeholder="0"
                        autoComplete="off"
                        value={fundAmt}
                        onChange={(e) => setFundAmt(formatInput(e.target.value))}
                      />
                    </div>
                    <div className="field" style={{ flex: "2 1 150px" }}>
                      <label htmlFor="pf-l">Libellé</label>
                      <input
                        id="pf-l"
                        maxLength={120}
                        placeholder="Ex. premier versement…"
                        autoComplete="off"
                        value={fundLabel}
                        onChange={(e) => setFundLabel(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="hint num" id="pf-hint" aria-live="polite">
                    {fCheck.bad ? (
                      <span className="bad">{fCheck.hint}</span>
                    ) : (
                      <>Disponible dans la caisse principale : {fmtNb(available)}&nbsp;FCFA</>
                    )}
                  </div>
                  <button className="btn" type="submit" disabled={!fCheck.ok}>
                    Approvisionner
                  </button>
                </form>
              </details>
              <details className="add" open>
                <summary>+ Enregistrer une sortie</summary>
                <form onSubmit={out}>
                  <div className="row">
                    <div className="field amount">
                      <label htmlFor="po-a">Montant (FCFA)</label>
                      <input
                        id="po-a"
                        inputMode="numeric"
                        placeholder="0"
                        autoComplete="off"
                        value={outAmt}
                        onChange={(e) => setOutAmt(formatInput(e.target.value))}
                      />
                    </div>
                    <div className="field" style={{ flex: "2 1 150px" }}>
                      <label htmlFor="po-l">Libellé</label>
                      <input
                        id="po-l"
                        maxLength={120}
                        placeholder="Ex. achat de matériaux…"
                        autoComplete="off"
                        value={outLabel}
                        onChange={(e) => setOutLabel(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="hint num" id="po-hint" aria-live="polite">
                    {oCheck.bad || oEmpty?.bad ? (
                      <span className="bad">{oCheck.bad ? oCheck.hint : oEmpty!.hint}</span>
                    ) : (
                      <>Solde du projet : {fmtNb(t.balance)}&nbsp;FCFA</>
                    )}
                  </div>
                  <button className="btn out" type="submit" disabled={!oCheck.ok}>
                    Enregistrer la sortie
                  </button>
                </form>
              </details>
            </>
          )}

          {done && (
            <div className="okbox" role="status">
              <b className="num">Sortie enregistrée : {fmtNb(done.amount)}&nbsp;FCFA</b>
              <span className="num">
                {done.label} · nouveau solde : {fmtNb(done.balance)}&nbsp;FCFA
              </span>
              {done.id ? (
                <Link className="btn ghost sm" href={`${report}?apres=${done.id}`}>
                  <IcoPrint /> Rapport
                </Link>
              ) : (
                <button className="btn ghost sm" type="button" disabled>
                  <IcoPrint /> Rapport
                </button>
              )}
              <button type="button" className="del" aria-label="Fermer le message" onClick={() => setDone(null)}>
                ×
              </button>
            </div>
          )}
        </div>

        <div className="col">
          <div className="sect">
            <h2>Mouvements</h2>
            <span>Du plus récent au plus ancien</span>
          </div>
          <div className="list">
            {moves.length ? (
              moves.map((m) => {
                const temp = isTemp(m.id);
                const name = moveName[m.type];
                const cls = m.type === "out" ? "o" : "i";
                if (editing === m.id && !p.closed)
                  return (
                    <div className="item editing" key={m.id}>
                      <MoveEditForm
                        title={name}
                        initial={{ amount: m.amount, label: m.label, date: m.day }}
                        today={today}
                        check={(amount) =>
                          amount ? checkProjectMove(state, m.type, m.amount, amount) : { ok: false, bad: false, hint: "" }
                        }
                        onCancel={() => setEditing(null)}
                        onSave={(v) => {
                          setEditing(null);
                          edit(m, v);
                        }}
                      />
                    </div>
                  );
                if (confirm === m.id) {
                  const c = checkProjectMove(state, m.type, m.amount, 0);
                  return (
                    <div className="item" key={m.id}>
                      <div className="meta">
                        <b>{m.label || name}</b>
                        <span className={c.bad ? "bad" : undefined}>{c.bad ? c.hint : deleteNotice[m.type]}</span>
                      </div>
                      <div className="confirm">
                        <button type="button" className="btn sm out" autoFocus disabled={!c.ok} onClick={() => remove(m)}>
                          Supprimer
                        </button>
                        <button type="button" className="btn sm ghost" onClick={() => setConfirm(null)}>
                          Annuler
                        </button>
                      </div>
                    </div>
                  );
                }
                const body = (
                  <>
                    <span className={`ico ${cls}`} aria-hidden="true">
                      {m.type === "fund" ? "↙" : m.type === "out" ? "↗" : "↩"}
                    </span>
                    <span className="meta">
                      <b>{m.label || name}</b>
                      <span>
                        {dfmt(m.day)} · {m.time} · {name}
                      </span>
                    </span>
                    <span className={`amt num ${cls}`}>{amountText(m)}</span>
                  </>
                );
                return (
                  <div className={`item${temp ? " fresh" : ""}`} key={m.id}>
                    {p.closed || temp ? (
                      body
                    ) : (
                      <button
                        type="button"
                        className="item-hit"
                        aria-label={`Modifier ${m.label || name}, ${fmt(m.amount)} FCFA`}
                        onClick={() => setEditing(m.id)}
                      >
                        {body}
                      </button>
                    )}
                    {m.type === "out" && !temp && (
                      <Link
                        className="del"
                        href={`${report}?apres=${m.id}`}
                        aria-label={`Rapport après la sortie ${m.label || name}`}
                        title="Rapport après cette sortie"
                      >
                        <IcoPrint />
                      </Link>
                    )}
                    {!p.closed && (
                      <button
                        type="button"
                        className="del"
                        aria-label={`Supprimer ${m.label || name}`}
                        disabled={temp}
                        onClick={() => setConfirm(m.id)}
                      >
                        <IcoTrash />
                      </button>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="empty">Aucun mouvement. Approvisionnez la caisse du projet pour commencer.</div>
            )}
          </div>
          <div className="pj-end">
            {!p.closed && (
              <div className="confirm" style={{ flexWrap: "wrap" }}>
                <button type="button" className={`btn sm ${ask === "close" ? "" : "ghost"}`} onClick={close}>
                  {ask === "close" ? `Confirmer : rendre ${fmt(t.balance)} FCFA à la caisse et clôturer` : "Clôturer le projet"}
                </button>
                {ask === "close" && (
                  <button type="button" className="btn sm ghost" onClick={() => setAsk(null)}>
                    Annuler
                  </button>
                )}
              </div>
            )}
            <div className="confirm" style={{ flexWrap: "wrap" }}>
              <button type="button" className={`btn sm ${ask === "delete" ? "out" : "ghost"}`} onClick={removeProject}>
                {ask === "delete"
                  ? `Confirmer : supprimer le projet et rendre ${fmt(t.allocated)} FCFA à la caisse`
                  : "Supprimer ce projet"}
              </button>
              {ask === "delete" && (
                <button type="button" className="btn sm ghost" onClick={() => setAsk(null)}>
                  Annuler
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

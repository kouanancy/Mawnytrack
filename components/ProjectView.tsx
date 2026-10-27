"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useOptimistic, useState, useTransition } from "react";
import { addDisbursement, deleteDisbursement, deleteProject, setTarget } from "@/app/(app)/investissements/actions";
import { IcoBack, IcoTrash } from "@/components/Icons";
import { kindName, projectState } from "@/components/InvestView";
import { useToast } from "@/components/Toast";
import type { Disbursement, Project } from "@/lib/caisse";
import { fmt, formatInput, parseAmount } from "@/lib/format";
import { tempId } from "@/lib/ledger";
import { localDayTime } from "@/lib/month";

type State = { project: Project; history: Disbursement[]; available: number };
type Op = { type: "add"; d: Disbursement } | { type: "delete"; id: string } | { type: "target"; target: number };

function reduce(s: State, op: Op): State {
  if (op.type === "target") return { ...s, project: { ...s.project, target: op.target } };
  if (op.type === "add")
    return {
      project: { ...s.project, engaged: s.project.engaged + op.d.amount },
      history: [op.d, ...s.history],
      available: s.available - op.d.amount,
    };
  const d = s.history.find((x) => x.id === op.id);
  if (!d) return s;
  return {
    project: { ...s.project, engaged: s.project.engaged - d.amount },
    history: s.history.filter((x) => x.id !== op.id),
    available: s.available + d.amount,
  };
}

const dfmt = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
};

/**
 * Règle : une sortie ne dépasse jamais le disponible en caisse ni le reste à financer.
 * Message mis à jour pendant la saisie et bouton désactivé ; même contrôle côté serveur.
 */
function checkOut(amount: number, available: number, rest: number) {
  const max = Math.min(available, rest);
  if (available <= 0) return { ok: false, bad: true, hint: "La caisse est vide : aucune sortie possible." };
  if (amount > available) return { ok: false, bad: true, hint: `Montant supérieur à la caisse disponible (${fmt(available)} FCFA).` };
  if (amount > rest)
    return { ok: false, bad: true, hint: `Montant supérieur au reste à financer (${fmt(rest)} FCFA). Augmentez le montant nécessaire pour continuer.` };
  return { ok: true, bad: false, hint: `Disponible en caisse : ${fmt(available)} FCFA · maximum pour ce projet : ${fmt(max)} FCFA` };
}

export function ProjectView({ data, tz }: { data: State; tz: string }) {
  const router = useRouter();
  const [view, apply] = useOptimistic(data, reduce);
  const [, startTransition] = useTransition();
  const toast = useToast();
  const [amount, setAmount] = useState("");
  const [label, setLabel] = useState("");
  const [confirm, setConfirm] = useState<string | null>(null);
  const [confirmProject, setConfirmProject] = useState(false);
  const { project: p, history, available } = view;
  const s = projectState(p);
  const amt = parseAmount(amount);
  const check = checkOut(amt, available, s.rest);

  function target(input: HTMLInputElement) {
    const v = parseAmount(input.value);
    const reset = () => (input.value = fmt(p.target));
    if (v === p.target) return reset();
    if (!v || v < p.engaged) {
      reset();
      return toast(`Le montant nécessaire ne peut pas être inférieur aux ${fmt(p.engaged)} FCFA déjà engagés`);
    }
    startTransition(async () => {
      apply({ type: "target", target: v });
      const r = await setTarget({ id: p.id, target: v });
      if (!r.ok) reset();
      toast(r.ok ? "Montant nécessaire mis à jour" : r.error);
    });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!amt) return toast("Saisissez un montant");
    if (!check.ok) return toast("Sortie impossible : vérifiez le montant");
    const sent = { projectId: p.id, amount: amt, label: label.trim() || "Sortie de caisse" };
    const { day, time } = localDayTime(new Date(), tz);
    setAmount("");
    setLabel("");
    startTransition(async () => {
      apply({ type: "add", d: { id: tempId(), amount: amt, label: sent.label, day, time } });
      const r = await addDisbursement(sent);
      toast(r.ok ? `${fmt(amt)} FCFA sortis de la caisse` : r.error);
    });
  }

  function removeOut(id: string) {
    setConfirm(null);
    startTransition(async () => {
      apply({ type: "delete", id });
      const r = await deleteDisbursement(id);
      toast(r.ok ? "Sortie supprimée, montant retourné en caisse" : r.error);
    });
  }

  function removeProject() {
    if (!confirmProject) return setConfirmProject(true);
    startTransition(async () => {
      const r = await deleteProject(p.id);
      if (!r.ok) return toast(r.error);
      toast("Projet supprimé, montants retournés en caisse");
      router.replace("/investissements");
    });
  }

  return (
    <>
      <div className="phead-bar">
        <Link className="btn ghost sm" href="/investissements">
          <IcoBack /> Investissements
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
            <span className={`pill ${s.status[0]}`}>{s.status[1]}</span>
          </section>
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
                  defaultValue={fmt(p.target)}
                  onInput={(e) => (e.currentTarget.value = formatInput(e.currentTarget.value))}
                  onBlur={(e) => target(e.currentTarget)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), e.currentTarget.blur())}
                />
              </div>
              <div className="cell ro">
                <span>Engagé</span>
                <output className="num">{fmt(p.engaged)}</output>
              </div>
            </div>
            <div className="lbar">
              <i style={{ width: `${s.pct}%` }} />
            </div>
            <div className="bl-msg num">
              {s.rest ? (
                <>
                  Reste à financer : <b>{fmt(s.rest)} FCFA</b>
                </>
              ) : (
                <span className="ok-t">Objectif atteint</span>
              )}
            </div>
          </div>
          {s.rest > 0 && (
            <form className="quick" aria-label="Nouvelle sortie de caisse" onSubmit={submit}>
              <div className="row">
                <div className="field amount">
                  <label htmlFor="d-a">Montant (FCFA)</label>
                  <input
                    id="d-a"
                    inputMode="numeric"
                    required
                    placeholder="0"
                    autoComplete="off"
                    value={amount}
                    onChange={(e) => setAmount(formatInput(e.target.value))}
                  />
                </div>
                <div className="field" style={{ flex: "2 1 150px" }}>
                  <label htmlFor="d-l">Libellé</label>
                  <input
                    id="d-l"
                    maxLength={120}
                    placeholder="Ex. achat, acompte…"
                    autoComplete="off"
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                  />
                </div>
              </div>
              <div className="hint num" id="d-hint" aria-live="polite">
                {check.bad ? <span className="bad">{check.hint}</span> : check.hint}
              </div>
              <button className="btn out" type="submit" disabled={!check.ok}>
                Sortir de la caisse
              </button>
            </form>
          )}
        </div>
        <div className="col">
          <div className="sect">
            <h2>Sorties de caisse</h2>
            <span className="num">
              {history.length} · {fmt(p.engaged)} FCFA
            </span>
          </div>
          <div className="list">
            {history.length ? (
              history.map((d) =>
                confirm === d.id ? (
                  <div className="item" key={d.id}>
                    <div className="meta">
                      <b>{d.label}</b>
                      <span>Le montant retournera dans la caisse.</span>
                    </div>
                    <div className="confirm">
                      <button type="button" className="btn sm out" autoFocus onClick={() => removeOut(d.id)}>
                        Supprimer
                      </button>
                      <button type="button" className="btn sm ghost" onClick={() => setConfirm(null)}>
                        Annuler
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className={`item${d.id.startsWith("tmp-") ? " fresh" : ""}`} key={d.id}>
                    <div className="ico o" aria-hidden="true">
                      ↗
                    </div>
                    <div className="meta">
                      <b>{d.label}</b>
                      <span>
                        {dfmt(d.day)} · {d.time}
                      </span>
                    </div>
                    <div className="amt num o">{fmt(d.amount)}</div>
                    <button
                      type="button"
                      className="del"
                      aria-label={`Supprimer ${d.label}`}
                      disabled={d.id.startsWith("tmp-")}
                      onClick={() => setConfirm(d.id)}
                    >
                      <IcoTrash />
                    </button>
                  </div>
                ),
              )
            ) : (
              <div className="empty">Aucune sortie pour le moment.</div>
            )}
          </div>
          <div className="confirm" style={{ flexWrap: "wrap" }}>
            <button type="button" className={`btn sm ${confirmProject ? "out" : "ghost"}`} onClick={removeProject}>
              {confirmProject ? "Confirmer la suppression du projet" : "Supprimer ce projet"}
            </button>
            {confirmProject && (
              <>
                <button type="button" className="btn sm ghost" onClick={() => setConfirmProject(false)}>
                  Annuler
                </button>
                <span className="hint">Les sorties de ce projet retourneront dans la caisse.</span>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

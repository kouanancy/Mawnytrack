"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useOptimistic, useState, useTransition } from "react";
import { createProject } from "@/app/(app)/investissements/actions";
import { useToast } from "@/components/Toast";
import type { Project } from "@/lib/caisse";
import { fmt, formatInput, parseAmount } from "@/lib/format";
import { tempId } from "@/lib/ledger";

/** État d'un projet : engagé, reste à financer, jauge et statut. */
export function projectState(p: Project) {
  const rest = Math.max(0, p.target - p.engaged);
  const pct = p.target ? Math.min(100, (p.engaged / p.target) * 100) : 0;
  const status: [string, string] = p.engaged === 0 ? ["run", "En préparation"] : rest === 0 ? ["ok", "Financé"] : ["prog", "En cours"];
  return { rest, pct, status };
}

export const kindName = (k: Project["kind"]) => (k === "investment" ? "Investissement" : "Projet");

type Filter = "all" | Project["kind"];

export function InvestView({ projects, available }: { projects: Project[]; available: number }) {
  const router = useRouter();
  const [view, add] = useOptimistic(projects, (list: Project[], p: Project) => [...list, p]);
  const [, startTransition] = useTransition();
  const toast = useToast();
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState(projects.length === 0);

  const invested = view.reduce((a, p) => a + p.engaged, 0);
  const toFund = view.reduce((a, p) => a + projectState(p).rest, 0);
  // Les éléments financés en bas de la liste
  const list = view
    .filter((p) => filter === "all" || p.kind === filter)
    .sort((a, b) => Number(projectState(a).rest === 0) - Number(projectState(b).rest === 0));

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const name = String(f.get("name") ?? "").trim();
    const kind = String(f.get("kind") ?? "investment") as Project["kind"];
    const target = parseAmount(String(f.get("target") ?? ""));
    if (!name || !target) return toast("Indiquez un nom et un montant");
    form.reset();
    startTransition(async () => {
      add({ id: tempId(), name, kind, target, engaged: 0 });
      const r = await createProject({ name, kind, target });
      if (!r.ok) return toast(r.error);
      toast(`Créé : ${name}`);
      router.push(`/investissements/${r.id}`);
    });
  }

  return (
    <div className="cols">
      <div className="stack col">
        <section className="hero" aria-label="Caisse disponible">
          <div className="lbl">Disponible en caisse</div>
          <div className={`big num${available < 0 ? " neg" : ""}`}>
            {fmt(available)}
            <small>FCFA</small>
          </div>
          <div className="split">
            <div>
              <span>Déjà investi</span>
              <strong className="num">{fmt(invested)}</strong>
            </div>
            <div>
              <span>Reste à financer</span>
              <strong className="num">{fmt(toFund)}</strong>
            </div>
          </div>
          {toFund > available ? (
            <div className="pct" style={{ color: "var(--hero-ink)" }}>
              La caisse couvre {Math.max(0, Math.round((available / toFund) * 100))} % des besoins restants.
            </div>
          ) : (
            <div className="pct">La caisse couvre tous les besoins restants.</div>
          )}
        </section>
        <div className="seg seg3" role="group" aria-label="Type">
          {(
            [
              ["all", "Tout"],
              ["investment", "Investissements"],
              ["project", "Projets"],
            ] as [Filter, string][]
          ).map(([k, name]) => (
            <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)}>
              {name}
            </button>
          ))}
        </div>
        <details className="add" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
          <summary>+ Nouvel investissement ou projet</summary>
          <form onSubmit={submit}>
            <div className="field">
              <label htmlFor="j-n">Nom</label>
              <input id="j-n" name="name" required maxLength={80} placeholder="Ex. stock de mèches, terrain…" autoComplete="off" />
            </div>
            <div className="row">
              <div className="field">
                <label htmlFor="j-k">Type</label>
                <select id="j-k" name="kind" defaultValue="investment">
                  <option value="investment">Investissement</option>
                  <option value="project">Projet</option>
                </select>
              </div>
              <div className="field amount">
                <label htmlFor="j-t">Montant nécessaire (FCFA)</label>
                <input
                  id="j-t"
                  name="target"
                  inputMode="numeric"
                  required
                  placeholder="0"
                  autoComplete="off"
                  onInput={(e) => (e.currentTarget.value = formatInput(e.currentTarget.value))}
                />
              </div>
            </div>
            <p className="hint">
              Les sorties d&apos;argent de ce volet sont prélevées uniquement sur la caisse. Elles ne touchent ni le budget
              ni les dépenses du mois.
            </p>
            <button className="btn" type="submit">
              Créer
            </button>
          </form>
        </details>
      </div>
      <div className="col">
        {list.length ? (
          list.map((p) => {
            const s = projectState(p);
            return (
              <Link key={p.id} className="proj" href={`/investissements/${p.id}`} aria-disabled={p.id.startsWith("tmp-")}>
                <div className="pj-top">
                  <div className="meta">
                    <b>{p.name}</b>
                    <span>{kindName(p.kind)}</span>
                  </div>
                  <span className={`pill ${s.status[0]}`}>{s.status[1]}</span>
                </div>
                <div className="lbar">
                  <i style={{ width: `${s.pct}%` }} />
                </div>
                <div className="sub num">
                  <span>
                    {fmt(p.engaged)} / {fmt(p.target)} FCFA
                  </span>
                  <span>{s.rest ? `Reste ${fmt(s.rest)}` : "Objectif atteint"}</span>
                </div>
              </Link>
            );
          })
        ) : (
          <div className="list">
            <div className="empty">Aucun élément. Ajoutez un investissement ou un projet.</div>
          </div>
        )}
      </div>
    </div>
  );
}

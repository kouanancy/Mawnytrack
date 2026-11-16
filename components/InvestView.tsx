"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useOptimistic, useState, useTransition } from "react";
import { createProject } from "@/app/(app)/investissements/actions";
import { useToast } from "@/components/Toast";
import type { Project } from "@/lib/caisse";
import { fmt, formatInput, parseAmount } from "@/lib/format";
import { tempId } from "@/lib/ledger";
import { projectStatus } from "@/lib/project-cash";

/**
 * État d'un élément : engagé (investissement) ou alloué (projet), reste à financer, jauge et statut.
 * Un projet clôturé n'a plus de reste à financer.
 */
export function projectState(p: Project) {
  const rest = p.closed ? 0 : Math.max(0, p.target - p.engaged);
  const pct = p.target ? Math.min(100, (p.engaged / p.target) * 100) : 0;
  const status: [string, string] =
    p.kind === "project"
      ? projectStatus(p)
      : p.engaged === 0
        ? ["run", "En préparation"]
        : rest === 0
          ? ["ok", "Financé"]
          : ["prog", "En cours"];
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

  const projectsOnly = filter === "project";
  const shown = view.filter((p) => filter === "all" || p.kind === filter);
  // Résumé d'origine (Tout, Investissements) : déjà investi et reste à financer des éléments affichés
  const invested = shown.reduce((a, p) => a + p.engaged, 0);
  const toFund = shown.reduce((a, p) => a + projectState(p).rest, 0);
  // Résumé des caisses des projets (filtre « Projets » uniquement)
  const projectItems = view.filter((p) => p.kind === "project");
  const inProjects = projectItems.reduce((a, p) => a + p.balance, 0);
  const spentOnProjects = projectItems.reduce((a, p) => a + p.spent, 0);
  // Les éléments financés en bas de la liste ; les projets clôturés dans leur section, avec le filtre « Projets »
  const list = shown
    .filter((p) => !p.closed)
    .sort((a, b) => Number(projectState(a).rest === 0) - Number(projectState(b).rest === 0));
  const closed = projectsOnly ? shown.filter((p) => p.closed) : [];

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
      add({ id: tempId(), name, kind, target, engaged: 0, spent: 0, back: 0, balance: 0, closed: false });
      const r = await createProject({ name, kind, target });
      if (!r.ok) return toast(r.error);
      toast(`Créé : ${name}`);
      router.push(`/investissements/${r.id}`);
    });
  }

  return (
    <div className="cols">
      <div className="stack col">
        {projectsOnly ? (
          <section className="hero" aria-label="Caisses des projets">
            <div className="lbl">Disponible dans la caisse principale</div>
            <div className={`big num${available < 0 ? " neg" : ""}`}>
              {fmt(available)}
              <small>FCFA</small>
            </div>
            <div className="split">
              <div>
                <span>Dans les caisses des projets</span>
                <strong className="num">{fmt(inProjects)}</strong>
              </div>
              <div>
                <span>Dépensé sur les projets</span>
                <strong className="num">{fmt(spentOnProjects)}</strong>
              </div>
            </div>
          </section>
        ) : (
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
        )}
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
              ni les dépenses du mois. Un projet a sa propre caisse, approvisionnée depuis la caisse principale.
            </p>
            <button className="btn" type="submit">
              Créer
            </button>
          </form>
        </details>
      </div>
      <div className="col">
        {list.length ? (
          list.map((p) => <Card key={p.id} p={p} />)
        ) : (
          <div className="list">
            <div className="empty">
              {shown.some((p) => p.closed) ? "Aucun élément en cours." : "Aucun élément. Ajoutez un investissement ou un projet."}
            </div>
          </div>
        )}
        {closed.length > 0 && (
          <>
            <div className="sect">
              <h2>Projets clôturés</h2>
              <span>{closed.length}</span>
            </div>
            {closed.map((p) => (
              <Card key={p.id} p={p} />
            ))}
          </>
        )}
      </div>
    </div>
  );
}

/** Carte d'un élément. Projet : solde de sa caisse en grand, « Alloué X / nécessaire Y » et « Dépensé Z ». */
function Card({ p }: { p: Project }) {
  const s = projectState(p);
  const temp = p.id.startsWith("tmp-");
  if (p.kind === "project")
    return (
      <Link className={`proj${p.closed ? " closed" : ""}`} href={`/investissements/${p.id}`} aria-disabled={temp}>
        <div className="pj-top">
          <div className="meta">
            <b>{p.name}</b>
            <span>
              {kindName(p.kind)} · <span className={`pill ${s.status[0]}`}>{s.status[1]}</span>
            </span>
          </div>
          <div className="pj-bal">
            <strong className="num">{fmt(p.balance)}</strong>
            <span>Solde du projet</span>
          </div>
        </div>
        <div className="lbar">
          <i style={{ width: `${s.pct}%` }} />
        </div>
        <div className="sub num">
          <span>
            Alloué {fmt(p.engaged)} / nécessaire {fmt(p.target)}
          </span>
          <span>Dépensé {fmt(p.spent)}</span>
        </div>
      </Link>
    );
  return (
    <Link className="proj" href={`/investissements/${p.id}`} aria-disabled={temp}>
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
}

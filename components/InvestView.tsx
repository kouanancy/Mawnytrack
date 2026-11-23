"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useOptimistic, useState, useTransition } from "react";
import { createEventBudget } from "@/app/(app)/investissements/budget-actions";
import { createProject } from "@/app/(app)/investissements/actions";
import { useToast } from "@/components/Toast";
import type { Project } from "@/lib/caisse";
import { eventDateLabel, type EventBudgetSummary } from "@/lib/event-budgets";
import { fmt, formatInput, parseAmount, plural } from "@/lib/format";
import { tempId } from "@/lib/ledger";
import { projectStatus } from "@/lib/project-cash";

/** État d'un projet : alloué, reste à financer, jauge et statut. Un projet clôturé n'a plus de reste à financer. */
export function projectState(p: Project) {
  const rest = p.closed ? 0 : Math.max(0, p.target - p.engaged);
  const pct = p.target ? Math.min(100, (p.engaged / p.target) * 100) : 0;
  return { rest, pct, status: projectStatus(p) };
}

type Filter = "all" | "budgets" | "projects";

/**
 * Module Investissements : projets (caisse propre, approvisionnée depuis la caisse principale) et budgets
 * d'événement (listes indépendantes). Filtre Tout · Budgets · Projets ; résumé du haut selon le filtre.
 */
export function InvestView({
  projects,
  budgets,
  available,
}: {
  projects: Project[];
  budgets: EventBudgetSummary[];
  available: number;
}) {
  const router = useRouter();
  const [view, add] = useOptimistic(projects, (list: Project[], p: Project) => [...list, p]);
  const [bview, addBudget] = useOptimistic(budgets, (list: EventBudgetSummary[], b: EventBudgetSummary) => [...list, b]);
  const [, startTransition] = useTransition();
  const toast = useToast();
  const [filter, setFilter] = useState<Filter>("all");
  const [openProject, setOpenProject] = useState(false);
  const [openBudget, setOpenBudget] = useState(projects.length === 0 && budgets.length === 0);

  const showProjects = filter !== "budgets";
  const showBudgets = filter !== "projects";
  // Résumé d'origine (Tout) : déjà investi (alloué aux projets) et reste à financer
  const invested = view.reduce((a, p) => a + p.engaged, 0);
  const toFund = view.reduce((a, p) => a + projectState(p).rest, 0);
  const inProjects = view.reduce((a, p) => a + p.balance, 0);
  const spentOnProjects = view.reduce((a, p) => a + p.spent, 0);
  const budgetsTotal = bview.reduce((a, b) => a + b.total, 0);
  const list = view.filter((p) => !p.closed).sort((a, b) => Number(projectState(a).rest === 0) - Number(projectState(b).rest === 0));
  const closed = filter === "projects" ? view.filter((p) => p.closed) : [];

  function submitProject(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const name = String(f.get("name") ?? "").trim();
    const target = parseAmount(String(f.get("target") ?? ""));
    if (!name || !target) return toast("Indiquez un nom et un montant");
    form.reset();
    startTransition(async () => {
      add({ id: tempId(), name, kind: "project", target, engaged: 0, spent: 0, back: 0, balance: 0, closed: false });
      const r = await createProject({ name, target });
      if (!r.ok) return toast(r.error);
      toast(`Projet créé : ${name}`);
      router.push(`/investissements/${r.id}`);
    });
  }

  function submitBudget(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const name = String(f.get("name") ?? "").trim();
    const eventDate = String(f.get("date") ?? "") || null;
    if (!name) return toast("Indiquez un nom");
    form.reset();
    startTransition(async () => {
      addBudget({ id: tempId(), name, eventDate, count: 0, total: 0 });
      const r = await createEventBudget({ name, eventDate });
      if (!r.ok) return toast(r.error);
      toast(`Budget créé : ${name}`);
      router.push(`/investissements/budgets/${r.id}`);
    });
  }

  const projectForm = (
    <details className="add" open={openProject} onToggle={(e) => setOpenProject(e.currentTarget.open)}>
      <summary>+ Nouveau projet</summary>
      <form onSubmit={submitProject}>
        <div className="field">
          <label htmlFor="j-n">Nom</label>
          <input id="j-n" name="name" required maxLength={80} placeholder="Ex. terrain, atelier…" autoComplete="off" />
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
        <p className="hint">
          Un projet a sa propre caisse, approvisionnée depuis la caisse principale. Ses sorties ne touchent ni le budget ni
          les dépenses du mois.
        </p>
        <button className="btn" type="submit">
          Créer le projet
        </button>
      </form>
    </details>
  );

  const budgetForm = (
    <details className="add" open={openBudget} onToggle={(e) => setOpenBudget(e.currentTarget.open)}>
      <summary>+ Nouveau budget</summary>
      <form onSubmit={submitBudget}>
        <div className="field">
          <label htmlFor="eb-n">Nom</label>
          <input id="eb-n" name="name" required maxLength={80} placeholder="Ex. Budget fête, anniversaire…" autoComplete="off" />
        </div>
        <div className="field">
          <label htmlFor="eb-d">Date de l&apos;événement (facultative)</label>
          <input id="eb-d" name="date" type="date" />
        </div>
        <p className="hint">Une liste d&apos;articles par catégorie, indépendante de la caisse et du budget du mois.</p>
        <button className="btn" type="submit">
          Créer le budget
        </button>
      </form>
    </details>
  );

  return (
    <div className="cols">
      <div className="stack col">
        {filter === "projects" ? (
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
        ) : filter === "budgets" ? (
          <section className="hero" aria-label="Budgets d'événement">
            <div className="lbl">Budgets d&apos;événement</div>
            <div className="big num">
              {fmt(budgetsTotal)}
              <small>FCFA prévus</small>
            </div>
            <div className="pct">
              {bview.length} {plural(bview.length, "budget", "budgets")} · listes indépendantes de la caisse et du budget du mois
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
        <div className="seg seg3" role="group" aria-label="Affichage">
          {(
            [
              ["all", "Tout"],
              ["budgets", "Budgets"],
              ["projects", "Projets"],
            ] as [Filter, string][]
          ).map(([k, name]) => (
            <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)}>
              {name}
            </button>
          ))}
        </div>
        {showProjects && projectForm}
        {showBudgets && budgetForm}
      </div>
      <div className="col">
        {showProjects && (
          <>
            {filter === "all" && (list.length > 0 || bview.length > 0) && (
              <div className="sect">
                <h2>Projets</h2>
                <span>{list.length}</span>
              </div>
            )}
            {list.length ? (
              list.map((p) => <ProjectCard key={p.id} p={p} />)
            ) : (
              <div className="list">
                <div className="empty">{view.some((p) => p.closed) ? "Aucun projet en cours." : "Aucun projet. Créez le premier."}</div>
              </div>
            )}
            {closed.length > 0 && (
              <>
                <div className="sect">
                  <h2>Projets clôturés</h2>
                  <span>{closed.length}</span>
                </div>
                {closed.map((p) => (
                  <ProjectCard key={p.id} p={p} />
                ))}
              </>
            )}
          </>
        )}
        {showBudgets && (
          <>
            {filter === "all" && (
              <div className="sect">
                <h2>Budgets d&apos;événement</h2>
                <span>{bview.length}</span>
              </div>
            )}
            {bview.length ? (
              bview.map((b) => <BudgetCard key={b.id} b={b} />)
            ) : (
              <div className="list">
                <div className="empty">Aucun budget d&apos;événement. Créez le premier, par exemple « Budget fête ».</div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** Carte d'un projet : solde de sa caisse en grand, « Alloué X / nécessaire Y » et « Dépensé Z ». */
function ProjectCard({ p }: { p: Project }) {
  const s = projectState(p);
  return (
    <Link className={`proj${p.closed ? " closed" : ""}`} href={`/investissements/${p.id}`} aria-disabled={p.id.startsWith("tmp-")}>
      <div className="pj-top">
        <div className="meta">
          <b>{p.name}</b>
          <span>
            Projet · <span className={`pill ${s.status[0]}`}>{s.status[1]}</span>
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
}

/** Carte d'un budget d'événement : nom, date, nombre d'articles et total prévu. */
function BudgetCard({ b }: { b: EventBudgetSummary }) {
  return (
    <Link className="proj" href={`/investissements/budgets/${b.id}`} aria-disabled={b.id.startsWith("tmp-")}>
      <div className="pj-top">
        <div className="meta">
          <b>{b.name}</b>
          <span>{b.eventDate ? eventDateLabel(b.eventDate) : "Date non fixée"}</span>
        </div>
        <div className="pj-bal">
          <strong className="num eb-amount">{fmt(b.total)}</strong>
          <span>Total prévu</span>
        </div>
      </div>
      <div className="sub num">
        <span>
          Budget d&apos;événement · {b.count} {plural(b.count, "article", "articles")}
        </span>
      </div>
    </Link>
  );
}

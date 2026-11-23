import "server-only";
import { sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { APP_TZ } from "@/lib/month";
import type { PeriodSettings } from "@/lib/period";
import { getPeriodSettings, periodKeySql } from "@/lib/period-server";

// Caisse, par période (mois budgétaire), revenus `income` seuls (jamais les emprunts) :
// - épargne prévue = revenus − budget prévu total (valeur figée de monthly_budgets, sinon budget_lines.planned), minimum 0 ;
// - période terminée : épargne = revenus − dépenses nettes réelles (expense − refund), minimum 0,
//   soit l'épargne prévue + le non dépensé ;
// - période en cours : épargne = épargne prévue ; le non dépensé n'est ajouté qu'à la clôture.
// Disponible en caisse = somme des épargnes, de la première période ayant un revenu à la période en cours,
// − toutes les sorties vers les investissements (project_disbursements)
// − les approvisionnements des projets + leurs restitutions (project_moves 'fund' / 'back').
// Les sorties d'un projet ('out') ne touchent que la caisse du projet. Tout est recalculé à chaque lecture :
// modifier ou supprimer une transaction d'une période terminée met à jour son épargne et la caisse.

export type CaisseMonth = {
  month: string;
  income: number;
  planned: number;
  /** Dépenses nettes réelles de la période (expense − refund) */
  out: number;
  /** Épargne prévue : revenus − budget prévu, minimum 0 */
  planSaving: number;
  /** Non dépensé ajouté à la clôture (0 pour la période en cours) ; négatif si des dépenses sans plafond l'emportent */
  unspent: number;
  /** Épargne de la période = épargne prévue + non dépensé */
  saving: number;
  /** Période terminée (le non dépensé est acquis) */
  closed: boolean;
  invested: number;
  /** Vers les caisses des projets : approvisionnements − restitutions de la période */
  toProjects: number;
  /** Caisse cumulée à la fin du mois */
  cum: number;
};

export type Project = {
  id: string;
  name: string;
  kind: "investment" | "project";
  target: number;
  /** Investissement : total sorti de la caisse ; Projet : alloué (approvisionnements − restitutions) */
  engaged: number;
  /** Projet : total des sorties de sa caisse */
  spent: number;
  /** Projet : total restitué à la caisse principale */
  back: number;
  /** Projet : solde de sa caisse (alloué − sorties) */
  balance: number;
  /** Projet clôturé (lecture seule) */
  closed: boolean;
};

/** Mouvement de la caisse d'un projet. */
export type ProjectMove = {
  id: string;
  type: "fund" | "out" | "back";
  amount: number;
  label: string;
  day: string;
  time: string;
};

export type Disbursement = { id: string; amount: number; label: string; day: string; time: string };

type Row = Record<string, unknown>;
type Rows = { rows: Row[] };
const n = (v: unknown) => (v == null ? 0 : Number(v));


/** Périodes (mois budgétaires) de la caisse : de la première ayant un revenu jusqu'à la période en cours. */
const monthsCte = (userId: string, ps: PeriodSettings) => sql`
  first as (
    select min(${periodKeySql(sql`occurred_at`, ps)}) as m from transactions where user_id = ${userId} and kind = 'income'
  ), months as (
    select generate_series(first.m, ${periodKeySql(sql`now()`, ps)}, interval '1 month')::date as m
    from first where first.m is not null
  )`;

/** Épargne supplémentaire de chaque mois (agrégats SQL, une seule requête). */
const savingsCtes = (userId: string, ps: PeriodSettings) => sql`
  ${monthsCte(userId, ps)},
  inc as (
    select ${periodKeySql(sql`occurred_at`, ps)} as m,
      coalesce(sum(amount) filter (where kind = 'income'), 0) as s,
      coalesce(sum(case kind when 'expense' then amount when 'refund' then -amount else 0 end), 0) as o
    from transactions where user_id = ${userId} and kind in ('income', 'expense', 'refund') group by 1
  ), pl as (
    select months.m, sum(coalesce(mb.planned, bl.planned)) as p
    from months
    cross join budget_lines bl
    left join monthly_budgets mb on mb.line_id = bl.id and mb.month = months.m
    where bl.user_id = ${userId}
    group by months.m
  ), sb as (
    select months.m, coalesce(inc.s, 0) as income, coalesce(pl.p, 0) as planned, coalesce(inc.o, 0) as net_out,
      greatest(coalesce(inc.s, 0) - coalesce(pl.p, 0), 0) as plan_saving,
      months.m < ${periodKeySql(sql`now()`, ps)} as closed
    from months left join inc on inc.m = months.m left join pl on pl.m = months.m
  ), sv as (
    -- Période terminée : épargne réelle (revenus − dépenses nettes) ; période en cours : épargne prévue
    select sb.*, case when closed then greatest(income - net_out, 0) else plan_saving end as saving
    from sb
  )`;

/** Disponible en caisse, en une expression SQL scalaire (réutilisée par le contrôle des sorties). */
export const caisseAvailableSql = (userId: string, ps: PeriodSettings) => sql`(
  with ${savingsCtes(userId, ps)}
  select coalesce((select sum(saving) from sv), 0)
    - coalesce((select sum(amount) from project_disbursements where user_id = ${userId}), 0)
    - coalesce((select sum(case type when 'fund' then amount when 'back' then -amount else 0 end)
        from project_moves where user_id = ${userId}), 0)
)`;

/** Fige les budgets des périodes terminées de la caisse (comme à leur consultation dans le Budget). */
function freezePastMonths(userId: string, ps: PeriodSettings) {
  return db.execute(sql`
    with ${monthsCte(userId, ps)}
    insert into monthly_budgets (user_id, line_id, month, planned, period_id)
    select bl.user_id, bl.id, months.m, bl.planned,
      (select bp.id from budget_periods bp where bp.user_id = ${userId} and bp.month = months.m)
    from months cross join budget_lines bl
    where bl.user_id = ${userId} and months.m < ${periodKeySql(sql`now()`, ps)}
    on conflict (line_id, month) do nothing`);
}

/** Historique complet de la caisse, mois par mois, et totaux. */
export async function getCaisse(userId: string) {
  const ps = await getPeriodSettings(userId);
  const [, hist, tot] = (await db.batch([
    freezePastMonths(userId, ps),
    db.execute(sql`
      with ${savingsCtes(userId, ps)},
      outm as (
        select ${periodKeySql(sql`occurred_at`, ps)} as m, sum(amount) as s
        from project_disbursements where user_id = ${userId} group by 1
      ), pjm as (
        select ${periodKeySql(sql`occurred_at`, ps)} as m,
          sum(case type when 'fund' then amount when 'back' then -amount else 0 end) as s
        from project_moves where user_id = ${userId} group by 1
      )
      select to_char(sv.m, 'YYYY-MM') as month, sv.income, sv.planned, sv.net_out, sv.plan_saving, sv.saving, sv.closed,
        coalesce(outm.s, 0) as invested, coalesce(pjm.s, 0) as to_projects,
        sum(sv.saving - coalesce(outm.s, 0) - coalesce(pjm.s, 0)) over (order by sv.m) as cum
      from sv left join outm on outm.m = sv.m left join pjm on pjm.m = sv.m
      order by sv.m`),
    db.execute(sql`
      select coalesce((select sum(amount) from project_disbursements where user_id = ${userId}), 0) as invested,
        coalesce((select sum(case type when 'fund' then amount when 'back' then -amount else 0 end)
          from project_moves where user_id = ${userId}), 0) as to_projects`),
  ])) as unknown as Rows[];
  const months: CaisseMonth[] = hist.rows.map((r) => ({
    month: String(r.month),
    income: n(r.income),
    planned: n(r.planned),
    out: n(r.net_out),
    planSaving: n(r.plan_saving),
    unspent: n(r.saving) - n(r.plan_saving),
    saving: n(r.saving),
    closed: r.closed === true,
    invested: n(r.invested),
    toProjects: n(r.to_projects),
    cum: n(r.cum),
  }));
  const saved = months.reduce((a, m) => a + m.saving, 0);
  const unspent = months.reduce((a, m) => a + m.unspent, 0);
  const invested = n(tot.rows[0]?.invested);
  const toProjects = n(tot.rows[0]?.to_projects);
  return { months, saved, unspent, invested, toProjects, available: saved - invested - toProjects, ps };
}

/** Colonnes d'un élément : agrégats des sorties (investissement) et des mouvements de caisse (projet). */
const projectFrom = (userId: string) => sql`
  projects p
  left join (
    select project_id, sum(amount) as s from project_disbursements where user_id = ${userId} group by 1
  ) d on d.project_id = p.id
  left join (
    select project_id,
      coalesce(sum(amount) filter (where type = 'fund'), 0) as fund,
      coalesce(sum(amount) filter (where type = 'out'), 0) as spent,
      coalesce(sum(amount) filter (where type = 'back'), 0) as back
    from project_moves where user_id = ${userId} group by 1
  ) m on m.project_id = p.id`;
const projectCols = sql`p.id, p.name, p.kind, p.target, p.closed_at, coalesce(d.s, 0) as disbursed,
  coalesce(m.fund, 0) as fund, coalesce(m.spent, 0) as spent, coalesce(m.back, 0) as back`;

const toProject = (r: Row): Project => {
  const isProject = r.kind === "project";
  const allocated = n(r.fund) - n(r.back);
  return {
    id: String(r.id),
    name: String(r.name),
    kind: r.kind as Project["kind"],
    target: n(r.target),
    engaged: isProject ? allocated : n(r.disbursed),
    spent: isProject ? n(r.spent) : 0,
    back: isProject ? n(r.back) : 0,
    balance: isProject ? allocated - n(r.spent) : 0,
    closed: r.closed_at != null,
  };
};

/** Investissements et projets avec leurs totaux, et disponible en caisse, en un seul lot. */
export async function getProjects(userId: string) {
  const [projects, avail] = (await db.batch([
    db.execute(sql`
      select ${projectCols} from ${projectFrom(userId)}
      where p.user_id = ${userId}
      order by p.created_at`),
    db.execute(sql`select ${caisseAvailableSql(userId, await getPeriodSettings(userId))} as available`),
  ])) as unknown as Rows[];
  return { projects: projects.rows.map(toProject), available: n(avail.rows[0]?.available) };
}

/**
 * Fiche d'un élément, en un seul lot : totaux, historique et disponible en caisse.
 * Investissement : sorties de caisse (project_disbursements) ; Projet : mouvements de sa caisse (project_moves).
 * Historique du plus récent au plus ancien.
 */
export async function getProject(userId: string, projectId: string) {
  const [project, history, moves, avail] = (await db.batch([
    db.execute(sql`
      select ${projectCols} from ${projectFrom(userId)}
      where p.user_id = ${userId} and p.id = ${projectId}`),
    db.execute(sql`
      select id, amount, label,
        to_char(occurred_at at time zone ${APP_TZ}, 'YYYY-MM-DD') as day,
        to_char(occurred_at at time zone ${APP_TZ}, 'HH24:MI') as time
      from project_disbursements
      where user_id = ${userId} and project_id = ${projectId}
      order by occurred_at desc, created_at desc`),
    db.execute(sql`
      select id, type, amount, label,
        to_char(occurred_at at time zone ${APP_TZ}, 'YYYY-MM-DD') as day,
        to_char(occurred_at at time zone ${APP_TZ}, 'HH24:MI') as time
      from project_moves
      where user_id = ${userId} and project_id = ${projectId}
      order by occurred_at desc, created_at desc, id desc`),
    db.execute(sql`select ${caisseAvailableSql(userId, await getPeriodSettings(userId))} as available`),
  ])) as unknown as Rows[];
  const p = project.rows[0];
  if (!p) return null;
  return {
    project: toProject(p),
    history: history.rows.map((r) => ({ id: String(r.id), amount: n(r.amount), label: String(r.label ?? ""), day: String(r.day), time: String(r.time) })),
    moves: moves.rows.map(
      (r): ProjectMove => ({
        id: String(r.id),
        type: r.type as ProjectMove["type"],
        amount: n(r.amount),
        label: String(r.label ?? ""),
        day: String(r.day),
        time: String(r.time),
      }),
    ),
    available: n(avail.rows[0]?.available),
  };
}

/** Rapport d'un projet : nom et mouvements de sa caisse, du plus ancien au plus récent (ordre stable). */
export async function getProjectReport(userId: string, projectId: string) {
  const [project, moves] = (await db.batch([
    db.execute(sql`select id, name, kind from projects where user_id = ${userId} and id = ${projectId}`),
    db.execute(sql`
      select id, type, amount, label,
        to_char(occurred_at at time zone ${APP_TZ}, 'YYYY-MM-DD') as day,
        to_char(occurred_at at time zone ${APP_TZ}, 'HH24:MI') as time
      from project_moves
      where user_id = ${userId} and project_id = ${projectId}
      order by occurred_at, created_at, id`),
  ])) as unknown as Rows[];
  const p = project.rows[0];
  if (!p || p.kind !== "project") return null;
  return {
    id: String(p.id),
    name: String(p.name),
    moves: moves.rows.map(
      (r): ProjectMove => ({
        id: String(r.id),
        type: r.type as ProjectMove["type"],
        amount: n(r.amount),
        label: String(r.label ?? ""),
        day: String(r.day),
        time: String(r.time),
      }),
    ),
  };
}

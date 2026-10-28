import "server-only";
import { sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { APP_TZ } from "@/lib/month";
import type { PeriodSettings } from "@/lib/period";
import { getPeriodSettings, periodKeySql } from "@/lib/period-server";

// Caisse : épargne supplémentaire de chaque mois = revenus `income` du mois (jamais les emprunts)
// − budget prévu total du mois (valeur figée de monthly_budgets, sinon budget_lines.planned), minimum 0.
// Disponible en caisse = somme des épargnes, du premier mois ayant un revenu au mois en cours,
// − toutes les sorties vers les investissements (project_disbursements).

export type CaisseMonth = {
  month: string;
  income: number;
  planned: number;
  saving: number;
  invested: number;
  /** Caisse cumulée à la fin du mois */
  cum: number;
};

export type Project = {
  id: string;
  name: string;
  kind: "investment" | "project";
  target: number;
  /** Total déjà sorti de la caisse pour ce projet */
  engaged: number;
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
    select ${periodKeySql(sql`occurred_at`, ps)} as m, sum(amount) as s
    from transactions where user_id = ${userId} and kind = 'income' group by 1
  ), pl as (
    select months.m, sum(coalesce(mb.planned, bl.planned)) as p
    from months
    cross join budget_lines bl
    left join monthly_budgets mb on mb.line_id = bl.id and mb.month = months.m
    where bl.user_id = ${userId}
    group by months.m
  ), sv as (
    select months.m, coalesce(inc.s, 0) as income, coalesce(pl.p, 0) as planned,
      greatest(coalesce(inc.s, 0) - coalesce(pl.p, 0), 0) as saving
    from months left join inc on inc.m = months.m left join pl on pl.m = months.m
  )`;

/** Disponible en caisse, en une expression SQL scalaire (réutilisée par le contrôle des sorties). */
export const caisseAvailableSql = (userId: string, ps: PeriodSettings) => sql`(
  with ${savingsCtes(userId, ps)}
  select coalesce((select sum(saving) from sv), 0)
    - coalesce((select sum(amount) from project_disbursements where user_id = ${userId}), 0)
)`;

/** Fige les budgets des périodes terminées de la caisse (comme à leur consultation dans le Budget). */
function freezePastMonths(userId: string, ps: PeriodSettings) {
  return db.execute(sql`
    with ${monthsCte(userId, ps)}
    insert into monthly_budgets (user_id, line_id, month, planned)
    select bl.user_id, bl.id, months.m, bl.planned
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
      )
      select to_char(sv.m, 'YYYY-MM') as month, sv.income, sv.planned, sv.saving,
        coalesce(outm.s, 0) as invested,
        sum(sv.saving - coalesce(outm.s, 0)) over (order by sv.m) as cum
      from sv left join outm on outm.m = sv.m
      order by sv.m`),
    db.execute(sql`
      select coalesce(sum(amount), 0) as invested from project_disbursements where user_id = ${userId}`),
  ])) as unknown as Rows[];
  const months: CaisseMonth[] = hist.rows.map((r) => ({
    month: String(r.month),
    income: n(r.income),
    planned: n(r.planned),
    saving: n(r.saving),
    invested: n(r.invested),
    cum: n(r.cum),
  }));
  const saved = months.reduce((a, m) => a + m.saving, 0);
  const invested = n(tot.rows[0]?.invested);
  return { months, saved, invested, available: saved - invested, ps };
}

const projectCols = sql`p.id, p.name, p.kind, p.target, coalesce(sum(d.amount), 0) as engaged`;
const toProject = (r: Row): Project => ({
  id: String(r.id),
  name: String(r.name),
  kind: r.kind as Project["kind"],
  target: n(r.target),
  engaged: n(r.engaged),
});

/** Investissements et projets avec leur engagé, et disponible en caisse, en un seul lot. */
export async function getProjects(userId: string) {
  const [projects, avail] = (await db.batch([
    db.execute(sql`
      select ${projectCols}
      from projects p left join project_disbursements d on d.project_id = p.id and d.user_id = p.user_id
      where p.user_id = ${userId}
      group by p.id
      order by p.created_at`),
    db.execute(sql`select ${caisseAvailableSql(userId, await getPeriodSettings(userId))} as available`),
  ])) as unknown as Rows[];
  return { projects: projects.rows.map(toProject), available: n(avail.rows[0]?.available) };
}

/** Fiche d'un projet : totaux, sorties (du plus récent au plus ancien) et disponible en caisse. */
export async function getProject(userId: string, projectId: string) {
  const [project, history, avail] = (await db.batch([
    db.execute(sql`
      select ${projectCols}
      from projects p left join project_disbursements d on d.project_id = p.id and d.user_id = p.user_id
      where p.user_id = ${userId} and p.id = ${projectId}
      group by p.id`),
    db.execute(sql`
      select id, amount, label,
        to_char(occurred_at at time zone ${APP_TZ}, 'YYYY-MM-DD') as day,
        to_char(occurred_at at time zone ${APP_TZ}, 'HH24:MI') as time
      from project_disbursements
      where user_id = ${userId} and project_id = ${projectId}
      order by occurred_at desc, created_at desc`),
    db.execute(sql`select ${caisseAvailableSql(userId, await getPeriodSettings(userId))} as available`),
  ])) as unknown as Rows[];
  const p = project.rows[0];
  if (!p) return null;
  return {
    project: toProject(p),
    history: history.rows.map((r) => ({ id: String(r.id), amount: n(r.amount), label: String(r.label ?? ""), day: String(r.day), time: String(r.time) })),
    available: n(avail.rows[0]?.available),
  };
}

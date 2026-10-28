import "server-only";
import { sql } from "drizzle-orm";
import { getProjects } from "@/lib/caisse";
import { getMonthData, type Direction, type Kind } from "@/lib/data";
import { db } from "@/lib/db";
import { reportEmail, sendEmail } from "@/lib/email";
import { lineState, summary } from "@/lib/ledger";
import { getPeople } from "@/lib/loans";
import { APP_TZ, addDays, localDayTime, mondayOf } from "@/lib/month";
import { periodOf, periodStart } from "@/lib/period";
import { getPeriodSettings } from "@/lib/period-server";
import { documentPdf } from "@/lib/pdf";
import { reportFilename, reportPeriod, reportSections, reportSubject, type WeeklyReport } from "@/lib/report-model";

type Row = Record<string, unknown>;
type Rows = { rows: Row[] };
const n = (v: unknown) => (v == null ? 0 : Number(v));

export const today = () => localDayTime(new Date(), APP_TZ).day;
/** Lundi de la semaine en cours. */
export const currentWeekStart = () => mondayOf(today());
/** Lundi de la dernière semaine terminée ou se terminant aujourd'hui (le dimanche soir : la semaine écoulée). */
export const lastWeekStart = () => {
  const t = today();
  const monday = mondayOf(t);
  return addDays(monday, 6) === t ? monday : addDays(monday, -7);
};

/** Bornes [lo, hi[ de la semaine dans le fuseau de l'application. */
function weekBounds(weekStart: string) {
  return {
    lo: sql`((${weekStart})::date)::timestamp at time zone ${APP_TZ}`,
    hi: sql`(((${weekStart})::date) + 7)::timestamp at time zone ${APP_TZ}`,
  };
}

/** Calcule le rapport d'une semaine : quatre lectures groupées, lancées en parallèle, agrégats en SQL. */
export async function computeReport(userId: string, weekStart: string): Promise<WeeklyReport> {
  const weekEnd = addDays(weekStart, 6);
  const t = today();
  // « Depuis le début du mois » = depuis le début de la période (mois budgétaire) en cours à la fin de la semaine
  const ps = await getPeriodSettings(userId);
  const month = periodOf(weekEnd <= t ? weekEnd : t, ps);
  const { lo, hi } = weekBounds(weekStart);

  const [monthData, people, caisse, week] = await Promise.all([
    getMonthData(userId, month, []),
    getPeople(userId),
    getProjects(userId),
    db.batch([
      db.execute(sql`
        select
          coalesce(sum(amount) filter (where kind = 'income'), 0) as income,
          coalesce(sum(amount) filter (where kind = 'borrow'), 0) as borrow,
          coalesce(sum(amount) filter (where kind = 'expense'), 0) as expense,
          coalesce(sum(amount) filter (where kind = 'refund'), 0) as refund
        from transactions where user_id = ${userId} and occurred_at >= ${lo} and occurred_at < ${hi}`),
      db.execute(sql`
        select line_id, sum(case kind when 'expense' then amount when 'refund' then -amount else 0 end) as net
        from transactions
        where user_id = ${userId} and line_id is not null and occurred_at >= ${lo} and occurred_at < ${hi}
        group by line_id`),
      db.execute(sql`
        select t.kind, t.amount, t.label, bl.label as line_label, p.direction, p.name as person_name,
          to_char(t.occurred_at at time zone ${APP_TZ}, 'YYYY-MM-DD') as day,
          to_char(t.occurred_at at time zone ${APP_TZ}, 'HH24:MI') as time
        from transactions t
        left join budget_lines bl on bl.id = t.line_id and bl.user_id = t.user_id
        left join people p on p.id = t.person_id and p.user_id = t.user_id
        where t.user_id = ${userId} and t.occurred_at >= ${lo} and t.occurred_at < ${hi}
        order by t.occurred_at, t.created_at`),
      db.execute(sql`
        select d.amount, d.label, pr.name as project,
          to_char(d.occurred_at at time zone ${APP_TZ}, 'YYYY-MM-DD') as day
        from project_disbursements d join projects pr on pr.id = d.project_id and pr.user_id = d.user_id
        where d.user_id = ${userId} and d.occurred_at >= ${lo} and d.occurred_at < ${hi}
        order by d.occurred_at`),
    ]) as unknown as Promise<Rows[]>,
  ]);
  const [wt, wl, we, wd] = week;
  const weekNet = new Map(wl.rows.map((r) => [String(r.line_id), n(r.net)]));
  const entries = we.rows.map((r) => ({
    kind: r.kind as Kind,
    amount: n(r.amount),
    label: String(r.label ?? ""),
    line: (r.line_label as string) ?? null,
    direction: (r.direction as Direction) ?? null,
    person: (r.person_name as string) ?? "",
    day: String(r.day),
    time: String(r.time),
  }));
  const mt = summary(monthData.totals);
  const w = wt.rows[0] ?? {};

  return {
    version: 1,
    weekStart,
    weekEnd,
    month,
    monthStart: periodStart(month, ps),
    generatedAt: new Date().toISOString(),
    week: { income: n(w.income), borrow: n(w.borrow), expense: n(w.expense), refund: n(w.refund) },
    monthToDate: { income: monthData.totals.income, borrow: monthData.totals.borrow, out: mt.out, rest: mt.rest },
    debts: monthData.debts,
    budget: monthData.lines.map((l) => {
      const st = lineState(l);
      return {
        label: l.label,
        group: l.direction ?? "budget",
        week: weekNet.get(l.id) ?? 0,
        month: l.spent,
        planned: l.planned,
        rest: l.planned ? Math.max(0, st.rest) : null,
        exhausted: l.planned > 0 && l.spent >= l.planned,
      };
    }),
    expenses: entries
      .filter((e) => e.kind === "expense" || e.kind === "refund")
      .map((e) => ({
        day: e.day,
        time: e.time,
        label: e.label,
        line: e.line ?? "Sans ligne",
        amount: e.kind === "refund" ? -e.amount : e.amount,
      })),
    lent: {
      moves: entries
        .filter((e) => e.direction === "lent" && (e.kind === "expense" || e.kind === "refund"))
        .map((e) => ({ day: e.day, person: e.person, label: e.label, type: e.kind === "expense" ? "loan" : "pay", amount: e.amount })),
      people: people.filter((p) => p.direction === "lent").map(({ name, total, back, due }) => ({ name, total, back, due })),
    },
    borrowed: {
      moves: entries
        .filter((e) => e.direction === "borrowed" && (e.kind === "borrow" || e.kind === "expense"))
        .map((e) => ({ day: e.day, person: e.person, label: e.label, type: e.kind === "borrow" ? "loan" : "pay", amount: e.amount })),
      people: people.filter((p) => p.direction === "borrowed").map(({ name, total, back, due }) => ({ name, total, back, due })),
    },
    caisse: {
      available: caisse.available,
      outs: wd.rows.map((r) => ({ day: String(r.day), project: String(r.project), label: String(r.label ?? ""), amount: n(r.amount) })),
      projects: caisse.projects
        .filter((p) => p.engaged < p.target)
        .map(({ name, kind, engaged, target }) => ({ name, kind, engaged, target })),
    },
    hasMovements: entries.length > 0 || wd.rows.length > 0,
  };
}

/** Calcule et enregistre (ou remplace) le rapport d'une semaine ; renvoie son identifiant. */
export async function generateReport(userId: string, weekStart: string) {
  return storeReport(userId, await computeReport(userId, weekStart));
}

/** Enregistre (ou remplace) un rapport calculé ; les données sont figées dans weekly_reports.data. */
export async function storeReport(userId: string, data: WeeklyReport) {
  const weekStart = data.weekStart;
  const res = (await db.execute(sql`
    insert into weekly_reports (user_id, week_start, week_end, data)
    values (${userId}, (${weekStart})::date, (${data.weekEnd})::date, ${JSON.stringify(data)}::jsonb)
    on conflict (user_id, week_start) do update set data = excluded.data, generated_at = now()
    returning id, sent_at`)) as unknown as Rows;
  const r = res.rows[0];
  return { id: String(r.id), sentAt: (r.sent_at as string) ?? null, data };
}

export type ReportListItem = { id: string; weekStart: string; weekEnd: string; generatedAt: string; sentAt: string | null; expense: number; income: number };

export async function listReports(userId: string): Promise<ReportListItem[]> {
  const res = (await db.execute(sql`
    select id, to_char(week_start, 'YYYY-MM-DD') as week_start, to_char(week_end, 'YYYY-MM-DD') as week_end,
      generated_at, sent_at,
      coalesce((data->'week'->>'expense')::bigint, 0) - coalesce((data->'week'->>'refund')::bigint, 0) as expense,
      coalesce((data->'week'->>'income')::bigint, 0) as income
    from weekly_reports where user_id = ${userId}
    order by week_start desc`)) as unknown as Rows;
  return res.rows.map((r) => ({
    id: String(r.id),
    weekStart: String(r.week_start),
    weekEnd: String(r.week_end),
    generatedAt: new Date(r.generated_at as string).toISOString(),
    sentAt: r.sent_at ? new Date(r.sent_at as string).toISOString() : null,
    expense: n(r.expense),
    income: n(r.income),
  }));
}

export async function getReport(userId: string, id: string) {
  const res = (await db.execute(sql`
    select id, data, generated_at, sent_at from weekly_reports where id = ${id} and user_id = ${userId}`)) as unknown as Rows;
  const r = res.rows[0];
  if (!r) return null;
  const data = (typeof r.data === "string" ? JSON.parse(r.data) : r.data) as WeeklyReport;
  return { id: String(r.id), data, sentAt: r.sent_at ? new Date(r.sent_at as string).toISOString() : null };
}

/** PDF complet du rapport (mêmes sections que la page). */
export function reportPdf(r: WeeklyReport) {
  return documentPdf({
    title: `Rapport de la semaine · ${reportPeriod(r)}`,
    subtitle: "Rapport de la semaine",
    right: ["Rapport de la semaine", reportPeriod(r)],
    tables: reportSections(r).map((s) => ({ heading: s.heading, note: s.note, columns: s.columns, rows: s.rows, footer: s.footer, empty: s.empty })),
  });
}

/** Envoie le rapport à l'adresse du compte (synthèse dans le corps, rapport complet en PDF joint). */
export async function sendReport(input: { email: string; reportId: string; data: WeeklyReport; origin: string }) {
  const pdf = await reportPdf(input.data);
  const ok = await sendEmail({
    to: input.email,
    ...reportEmail(input.data, `${input.origin}/rapports/${input.reportId}`, input.origin),
    subject: reportSubject(input.data),
    attachments: [{ filename: reportFilename(input.data), content: Buffer.from(pdf).toString("base64") }],
  });
  if (ok) await db.execute(sql`update weekly_reports set sent_at = now() where id = ${input.reportId}`);
  return ok;
}

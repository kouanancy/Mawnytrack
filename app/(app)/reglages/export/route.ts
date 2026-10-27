import { sql } from "drizzle-orm";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import pkg from "@/package.json";

type Rows = { rows: Record<string, unknown>[] };

/** Export JSON de toutes les données de l'utilisateur connecté (jamais de mot de passe ni de jeton). */
export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return new Response("Session expirée. Reconnectez-vous.", { status: 401 });
  const id = session.user.id;
  const q = (table: string, order: string) =>
    db.execute(sql`select * from ${sql.identifier(table)} where user_id = ${id} order by ${sql.raw(order)}`);
  const res = (await db.batch([
    db.execute(sql`select id, name, email, created_at from users where id = ${id}`),
    q("user_settings", "user_id"),
    q("people", "created_at"),
    q("budget_lines", "position, created_at"),
    q("monthly_budgets", "month, line_id"),
    q("transactions", "occurred_at"),
    q("projects", "created_at"),
    q("project_disbursements", "occurred_at"),
    q("weekly_reports", "week_start"),
  ])) as unknown as Rows[];
  const [user, settings, people, budgetLines, monthlyBudgets, transactions, projects, disbursements, reports] = res.map((r) => r.rows);
  const data = {
    application: "Mawnytrack",
    version: pkg.version,
    exported_at: new Date().toISOString(),
    currency: "XOF (FCFA)",
    user: user[0] ?? null,
    settings: settings[0] ?? null,
    people,
    budget_lines: budgetLines,
    monthly_budgets: monthlyBudgets,
    transactions,
    projects,
    project_disbursements: disbursements,
    weekly_reports: reports,
  };
  const day = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="mawnytrack-export-${day}.json"`,
      "Cache-Control": "no-store",
    },
  });
}

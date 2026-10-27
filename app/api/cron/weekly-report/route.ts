import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { appOrigin } from "@/lib/origin";
import { computeReport, lastWeekStart, sendReport, storeReport } from "@/lib/report";

// Tâche planifiée Vercel Cron (vercel.json) : chaque dimanche à 20 h, heure d'Abidjan (UTC+0, donc 20:00 UTC).
// Génère et enregistre le rapport de la semaine écoulée pour chaque utilisateur qui l'a demandé, puis l'envoie
// par e-mail. Rien n'est envoyé si la semaine ne contient aucun mouvement, ni deux fois pour la même semaine.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Non autorisé", { status: 401 });
  }
  const weekStart = lastWeekStart();
  const origin = await appOrigin();
  const users = (await db.execute(sql`
    select u.id, u.email from users u
    left join user_settings s on s.user_id = u.id
    where coalesce(s.weekly_email, true)`)) as unknown as { rows: { id: string; email: string }[] };

  const result = { week: weekStart, users: users.rows.length, sent: 0, empty: 0, already: 0, failed: 0 };
  for (const u of users.rows) {
    try {
      // Semaine sans aucun mouvement : rien n'est enregistré ni envoyé
      const data = await computeReport(u.id, weekStart);
      if (!data.hasMovements) {
        result.empty++;
        continue;
      }
      const report = await storeReport(u.id, data);
      if (report.sentAt) result.already++;
      else if (await sendReport({ email: u.email, reportId: report.id, data: report.data, origin })) result.sent++;
      else result.failed++;
    } catch (err) {
      result.failed++;
      console.error(`[rapport] Échec pour ${u.id} :`, err);
    }
  }
  console.log("[rapport]", JSON.stringify(result));
  return Response.json(result);
}

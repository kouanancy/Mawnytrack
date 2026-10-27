import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { pdfResponse } from "@/lib/pdf";
import { getReport, reportPdf } from "@/lib/report";
import { reportFilename } from "@/lib/report-model";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Rapport hebdomadaire en PDF, à partir des données figées. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return new Response("Session expirée. Reconnectez-vous.", { status: 401 });
  const { id } = await params;
  if (!UUID_RE.test(id)) return new Response("Introuvable", { status: 404 });
  const report = await getReport(session.user.id, id);
  if (!report) return new Response("Introuvable", { status: 404 });
  return pdfResponse(await reportPdf(report.data), reportFilename(report.data));
}

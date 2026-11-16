import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getProjectReport } from "@/lib/caisse";
import { fmt } from "@/lib/format";
import { APP_TZ, localDayTime } from "@/lib/month";
import { pdfResponse, tablePdf, type TableRow } from "@/lib/pdf";
import { buildProjectReport } from "@/lib/project-report";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Rapport du projet en PDF (complet, ou après une sortie), mêmes lignes que la page du rapport. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return new Response("Session expirée. Reconnectez-vous.", { status: 401 });
  const { id } = await params;
  if (!UUID_RE.test(id)) return new Response("Introuvable", { status: 404 });
  const data = await getProjectReport(session.user.id, id);
  if (!data) return new Response("Introuvable", { status: 404 });
  const apres = new URL(req.url).searchParams.get("apres");
  const r = buildProjectReport({
    name: data.name,
    moves: data.moves,
    after: apres && UUID_RE.test(apres) ? apres : null,
    today: localDayTime(new Date(), APP_TZ).day,
  });
  const n = (v: number | null) => (v == null ? "" : fmt(v));
  const rows: TableRow[] = r.lines.map((l) => ({
    cells: [l.date, l.label, n(l.in), n(l.out), fmt(l.balance)],
    style: l.highlight ? "highlight" : undefined,
  }));
  const bytes = await tablePdf({
    title: `${r.title} · ${r.name} · ${r.subtitle}`,
    subtitle: r.title,
    right: [r.name, r.subtitle],
    columns: [
      { label: "Date", width: 15 },
      { label: "Libellé", width: 37 },
      { label: "Entrée", width: 16, align: "right" },
      { label: "Sortie", width: 16, align: "right" },
      { label: "Solde", width: 16, align: "right" },
    ],
    rows,
    empty: "Aucun mouvement.",
    footer: [
      { cells: ["Totaux", null, fmt(r.totals.in), fmt(r.totals.out), ""], style: "total" },
      { cells: [r.end.label, null, null, null, `${fmt(r.end.balance)} FCFA`], style: "end" },
    ],
    after: `Alloué depuis la caisse : ${fmt(r.summary.funded)} FCFA · Dépensé : ${fmt(r.summary.spent)} FCFA · Restitué à la caisse : ${fmt(r.summary.back)} FCFA`,
  });
  return pdfResponse(bytes, r.filename);
}

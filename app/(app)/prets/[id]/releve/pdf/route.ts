import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { fmt } from "@/lib/format";
import { getStatement } from "@/lib/loans";
import { currentMonth, isValidMonth, monthLabel } from "@/lib/month";
import { pdfResponse, tablePdf } from "@/lib/pdf";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Relevé mensuel en PDF (même contenu que la page du relevé). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return new Response("Session expirée. Reconnectez-vous.", { status: 401 });
  const { id } = await params;
  const m = new URL(req.url).searchParams.get("m");
  const month = isValidMonth(m) ? m : currentMonth();
  if (!UUID_RE.test(id)) return new Response("Introuvable", { status: 404 });
  const data = await getStatement(session.user.id, id, month);
  if (!data) return new Response("Introuvable", { status: 404 });

  const { person: p, before, rows } = data;
  const L = p.direction === "lent";
  const [y, mo] = month.split("-").map(Number);
  const tl = rows.filter((r) => r.type === "loan").reduce((a, r) => a + r.amount, 0);
  const tp = rows.filter((r) => r.type === "pay").reduce((a, r) => a + r.amount, 0);
  const end = Math.max(0, before + tl - tp);
  const lastDay = new Date(Date.UTC(y, mo, 0)).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  const label = monthLabel(month);

  const bytes = await tablePdf({
    title: `Relevé ${L ? "de prêts" : "d'emprunts"} · ${p.name} · ${label}`,
    subtitle: `Relevé ${L ? "de prêts" : "d'emprunts"}`,
    right: [p.name, label.charAt(0).toUpperCase() + label.slice(1)],
    columns: [
      { label: "Date", width: 14 },
      { label: "Libellé", width: 46 },
      { label: L ? "Prêt" : "Emprunt", width: 20, align: "right" },
      { label: "Remboursement", width: 20, align: "right" },
    ],
    rows: [
      { cells: [`01/${String(mo).padStart(2, "0")}`, "Reste dû au début du mois", fmt(before), null], style: "muted" },
      ...rows.map((r) => ({
        cells: [
          `${r.day.slice(8, 10)}/${r.day.slice(5, 7)}`,
          r.label || (r.type === "loan" ? (L ? "Prêt" : "Emprunt") : "Remboursement"),
          r.type === "loan" ? fmt(r.amount) : "",
          r.type === "pay" ? fmt(r.amount) : "",
        ],
      })),
    ],
    footer: [
      { cells: ["Total du mois", null, fmt(tl), fmt(tp)], style: "total" },
      { cells: [`Reste dû au ${lastDay}`, null, `${fmt(end)} FCFA`, null], style: "end" },
    ],
  });
  const slug = p.name.normalize("NFD").replace(/[^\w]+/g, "-").toLowerCase();
  return pdfResponse(bytes, `releve-${slug}-${month}.pdf`);
}

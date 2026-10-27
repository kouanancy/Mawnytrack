import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { fmt } from "@/lib/format";
import { getStatement } from "@/lib/loans";
import { APP_TZ, currentMonth, isValidMonth, localDayTime } from "@/lib/month";
import { pdfResponse, tablePdf, type TableRow } from "@/lib/pdf";
import { buildStatement } from "@/lib/statement";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Relevé en PDF (un mois, ou « tout » pour tout le relevé), mêmes lignes que la page du relevé. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return new Response("Session expirée. Reconnectez-vous.", { status: 401 });
  const { id } = await params;
  if (!UUID_RE.test(id)) return new Response("Introuvable", { status: 404 });
  const m = new URL(req.url).searchParams.get("m");
  const period = m === "tout" ? "tout" : isValidMonth(m) ? m : currentMonth();
  const data = await getStatement(session.user.id, id, period);
  if (!data) return new Response("Introuvable", { status: 404 });

  const st = buildStatement({
    name: data.person.name,
    direction: data.person.direction,
    period,
    before: data.before,
    rows: data.rows,
    today: localDayTime(new Date(), APP_TZ).day,
  });
  const n = (v: number | null) => (v == null ? "" : fmt(v));
  const rows: TableRow[] = st.rows.map((r) => {
    switch (r.kind) {
      case "carry":
        return { cells: [r.date, r.label, null, null, fmt(r.balance)], style: "muted" };
      case "month":
        return { cells: [r.label, null, null, null, null], style: "group" };
      case "move":
        return { cells: [r.date, r.label, n(r.loan), n(r.pay), fmt(r.balance)] };
      case "subtotal":
        return { cells: [r.label, null, fmt(r.loan), fmt(r.pay), fmt(r.balance)], style: "subtotal" };
      case "total":
        return { cells: [r.label, null, fmt(r.loan), fmt(r.pay), ""], style: "total" };
      case "end":
        return { cells: [r.label, null, null, null, `${fmt(r.balance)} FCFA`], style: "end" };
    }
  });
  const footStart = rows.findIndex((r) => r.style === "total");
  const bytes = await tablePdf({
    title: `${st.title} · ${st.name} · ${st.periodLabel}`,
    subtitle: st.title,
    right: [st.name, st.periodLabel],
    columns: [
      { label: "Date", width: 11 },
      { label: "Libellé", width: 38 },
      { label: st.loanLabel, width: 17, align: "right" },
      { label: "Remboursement", width: 17, align: "right" },
      { label: "Reste dû", width: 17, align: "right" },
    ],
    rows: st.empty && period === "tout" ? [] : rows.slice(0, footStart),
    empty: "Aucun mouvement.",
    footer: rows.slice(footStart),
  });
  return pdfResponse(bytes, st.filename);
}

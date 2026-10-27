import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getMonthData } from "@/lib/data";
import { fmt } from "@/lib/format";
import { category } from "@/lib/ledger";
import { currentMonth, isValidMonth, monthLabel } from "@/lib/month";
import { pdfResponse, tablePdf } from "@/lib/pdf";
import { sortiesFilename } from "@/lib/statement";

/** Sorties du mois en PDF, éventuellement filtrées par catégorie (même contenu que l'impression). */
export async function GET(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return new Response("Session expirée. Reconnectez-vous.", { status: 401 });
  const q = new URL(req.url).searchParams;
  const m = q.get("m");
  const month = isValidMonth(m) ? m : currentMonth();
  const lineId = q.get("ligne");

  const data = await getMonthData(session.user.id, month, ["expense", "refund"]);
  const line = lineId ? data.lines.find((l) => l.id === lineId) : undefined;
  const entries = data.entries.filter((e) => !line || e.lineId === line.id);
  const total = entries.reduce((a, e) => a + (e.kind === "refund" ? -e.amount : e.amount), 0);
  const cur = line?.label ?? "Toutes les catégories";

  const bytes = await tablePdf({
    title: `Sorties de ${monthLabel(month)} · ${cur}`,
    columns: [
      { label: "Date", width: 16 },
      { label: "Libellé", width: 38 },
      { label: "Catégorie", width: 28 },
      { label: "Montant", width: 18, align: "right" },
    ],
    rows: entries.map((e) => ({
      cells: [
        `${e.day.slice(8, 10)}/${e.day.slice(5, 7)} ${e.time}`,
        e.label,
        category(e),
        `${e.kind === "refund" ? "+" : "-"}${fmt(e.amount)}`,
      ],
    })),
    empty: "Aucune sortie.",
    footer: [{ cells: [`Total ${cur}`, null, null, `${fmt(total)} FCFA`], style: "total" }],
  });
  return pdfResponse(bytes, sortiesFilename(monthLabel(month), line?.label));
}

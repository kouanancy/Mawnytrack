import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { budgetFilename, budgetTotals } from "@/lib/budgets";
import { getBudget } from "@/lib/budgets-server";
import { fmt } from "@/lib/format";
import { APP_TZ, localDayTime, longDay } from "@/lib/month";
import { pdfResponse, tablePdf, type TableRow } from "@/lib/pdf";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Budget en PDF (A4 portrait, fond blanc) : en-tête « BUDGET », nom et « Établi le », trois cases (Lignes,
 * Catégories, Total), tableau Désignation · Montant par catégorie avec sous-totaux, total, pied de page.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return new Response("Session expirée. Reconnectez-vous.", { status: 401 });
  const { id } = await params;
  if (!UUID_RE.test(id)) return new Response("Introuvable", { status: 404 });
  const b = await getBudget(session.user.id, id);
  if (!b) return new Response("Introuvable", { status: 404 });
  const today = localDayTime(new Date(), APP_TZ).day;
  const { categories, total, lines } = budgetTotals(b);

  const rows: TableRow[] = categories.flatMap((c) => [
    { cells: [c.name.toUpperCase(), null], style: "group" as const },
    ...c.items.map((i) => ({ cells: [i.label, fmt(i.amount)] })),
    { cells: [`Sous-total ${c.name}`, fmt(c.subtotal)], style: "subtotal" as const },
  ]);
  const bytes = await tablePdf({
    title: `Budget · ${b.name}`,
    subtitle: "BUDGET",
    rightLines: [b.name, `Établi le ${longDay(today).replace(/^1 /, "1er ")}`],
    boxes: [
      { label: "Lignes", value: String(lines) },
      { label: "Catégories", value: String(categories.length) },
      { label: "Total", value: `${fmt(total)} FCFA` },
    ],
    hideTitle: true,
    footerLeft: `Mawnytrack · Budget · ${b.name}`,
    columns: [
      { label: "Désignation", width: 72 },
      { label: "Montant", width: 28, align: "right" },
    ],
    rows,
    empty: "Aucune ligne.",
    footer: [{ cells: ["Total", `${fmt(total)} FCFA`], style: "total" }],
  });
  return pdfResponse(bytes, budgetFilename(b.name, today));
}

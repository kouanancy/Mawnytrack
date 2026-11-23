import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { budgetFilename, eventDateLabel, groupItems } from "@/lib/event-budgets";
import { getEventBudget } from "@/lib/event-budgets-server";
import { fmt } from "@/lib/format";
import { APP_TZ, localDayTime, longDay } from "@/lib/month";
import { pdfResponse, tablePdf, type TableRow } from "@/lib/pdf";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Budget d'événement en PDF (A4 portrait, fond blanc) : en-tête « BUDGET D'ÉVÉNEMENT », trois cases (Articles,
 * Catégories, Total prévu), tableau Désignation · Montant par catégorie avec sous-totaux, total, notes.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return new Response("Session expirée. Reconnectez-vous.", { status: 401 });
  const { id } = await params;
  if (!UUID_RE.test(id)) return new Response("Introuvable", { status: 404 });
  const b = await getEventBudget(session.user.id, id);
  if (!b) return new Response("Introuvable", { status: 404 });
  const today = localDayTime(new Date(), APP_TZ).day;
  const { groups, total, count } = groupItems(b.items);

  const rows: TableRow[] = groups.flatMap((g) => [
    { cells: [g.category.toUpperCase(), null], style: "group" as const },
    ...g.items.map((i) => ({ cells: [i.label, fmt(i.amount)] })),
    { cells: [`Sous-total ${g.category}`, fmt(g.subtotal)], style: "subtotal" as const },
  ]);
  const bytes = await tablePdf({
    title: `Budget d'événement · ${b.name}`,
    subtitle: "BUDGET D'ÉVÉNEMENT",
    rightLines: [
      b.name,
      `Date de l'événement : ${b.eventDate ? eventDateLabel(b.eventDate) : "non fixée"}`,
      `Établi le ${longDay(today).replace(/^1 /, "1er ")}`,
    ],
    boxes: [
      { label: "Articles", value: String(count) },
      { label: "Catégories", value: String(groups.length) },
      { label: "Total prévu", value: `${fmt(total)} FCFA` },
    ],
    hideTitle: true,
    footerLeft: `Mawnytrack · Budget d'événement · ${b.name}`,
    columns: [
      { label: "Désignation", width: 72 },
      { label: "Montant", width: 28, align: "right" },
    ],
    rows,
    empty: "Aucun article.",
    footer: [{ cells: ["Total prévu", `${fmt(total)} FCFA`], style: "total" }],
    after: b.notes.trim() ? `Notes : ${b.notes.trim().replace(/\s+/g, " ")}` : undefined,
  });
  return pdfResponse(bytes, budgetFilename(b.name, b.eventDate ?? today));
}

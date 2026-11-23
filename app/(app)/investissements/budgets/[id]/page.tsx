import { notFound } from "next/navigation";
import { BudgetDetailView } from "@/components/BudgetDetailView";
import { getBudget } from "@/lib/budgets-server";
import { APP_TZ, localDayTime } from "@/lib/month";
import { requireUserId } from "@/lib/session";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Fiche d'un budget (?nouveau : budget tout juste créé, nom de la première catégorie prêt à la saisie). */
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ nouveau?: string }>;
}) {
  const [userId, { id }, { nouveau }] = await Promise.all([requireUserId(), params, searchParams]);
  if (!UUID_RE.test(id)) notFound();
  const data = await getBudget(userId, id);
  if (!data) notFound();
  return <BudgetDetailView key={id} data={data} today={localDayTime(new Date(), APP_TZ).day} fresh={nouveau !== undefined} />;
}

import { notFound } from "next/navigation";
import { EventBudgetView } from "@/components/EventBudgetView";
import { getEventBudget } from "@/lib/event-budgets-server";
import { APP_TZ, localDayTime } from "@/lib/month";
import { requireUserId } from "@/lib/session";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Fiche d'un budget d'événement. */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const [userId, { id }] = await Promise.all([requireUserId(), params]);
  if (!UUID_RE.test(id)) notFound();
  const data = await getEventBudget(userId, id);
  if (!data) notFound();
  return <EventBudgetView key={id} data={data} today={localDayTime(new Date(), APP_TZ).day} />;
}

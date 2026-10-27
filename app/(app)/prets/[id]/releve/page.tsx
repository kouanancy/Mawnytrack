import { notFound } from "next/navigation";
import { StatementView } from "@/components/StatementView";
import { getStatement } from "@/lib/loans";
import { APP_TZ, currentMonth, localDayTime, shiftMonth } from "@/lib/month";
import { requireUserId } from "@/lib/session";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ m?: string }>;
}) {
  const [userId, { id }, { m }] = await Promise.all([requireUserId(), params, searchParams]);
  if (!UUID_RE.test(id)) notFound();
  // « Tout le relevé » puis les 12 derniers mois, du plus récent au plus ancien
  const months = Array.from({ length: 12 }, (_, i) => shiftMonth(currentMonth(), -i));
  const period = m === "tout" ? "tout" : m && months.includes(m) ? m : months[0];
  const data = await getStatement(userId, id, period);
  if (!data) notFound();
  return (
    <StatementView
      person={data.person}
      period={period}
      months={months}
      before={data.before}
      rows={data.rows}
      today={localDayTime(new Date(), APP_TZ).day}
    />
  );
}

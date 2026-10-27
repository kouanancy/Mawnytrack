import { notFound } from "next/navigation";
import { StatementView } from "@/components/StatementView";
import { getStatement } from "@/lib/loans";
import { currentMonth, shiftMonth } from "@/lib/month";
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
  // Les 12 derniers mois, du plus récent au plus ancien
  const months = Array.from({ length: 12 }, (_, i) => shiftMonth(currentMonth(), -i));
  const month = m && months.includes(m) ? m : months[0];
  const data = await getStatement(userId, id, month);
  if (!data) notFound();
  return <StatementView person={data.person} month={month} months={months} before={data.before} rows={data.rows} />;
}

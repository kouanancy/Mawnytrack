import { BudgetView } from "@/components/BudgetView";
import { getMonthData } from "@/lib/data";
import { currentPeriod, parsePeriod, periodEndLabel } from "@/lib/period";
import { getPeriodSettings } from "@/lib/period-server";
import { requireUserId } from "@/lib/session";

export default async function Page({ searchParams }: { searchParams: Promise<{ m?: string | string[] }> }) {
  const [userId, { m }] = await Promise.all([requireUserId(), searchParams]);
  const ps = await getPeriodSettings(userId);
  const month = parsePeriod(m, ps);
  const data = await getMonthData(userId, month, []);
  const current = currentPeriod(ps);
  const status = month < current ? "past" : month === current ? "current" : "future";
  return <BudgetView key={month} data={data} month={month} status={status} endLabel={periodEndLabel(month, ps)} />;
}

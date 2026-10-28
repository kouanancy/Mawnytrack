import { BudgetView } from "@/components/BudgetView";
import { getMonthData } from "@/lib/data";
import { parsePeriod } from "@/lib/period";
import { getPeriodSettings } from "@/lib/period-server";
import { requireUserId } from "@/lib/session";

export default async function Page({ searchParams }: { searchParams: Promise<{ m?: string | string[] }> }) {
  const [userId, { m }] = await Promise.all([requireUserId(), searchParams]);
  const month = parsePeriod(m, await getPeriodSettings(userId));
  const data = await getMonthData(userId, month, []);
  return <BudgetView key={month} data={data} month={month} />;
}

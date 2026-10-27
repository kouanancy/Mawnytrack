import { BudgetView } from "@/components/BudgetView";
import { getMonthData } from "@/lib/data";
import { parseMonth } from "@/lib/month";
import { requireUserId } from "@/lib/session";

export default async function Page({ searchParams }: { searchParams: Promise<{ m?: string | string[] }> }) {
  const [userId, { m }] = await Promise.all([requireUserId(), searchParams]);
  const month = parseMonth(m);
  const data = await getMonthData(userId, month, []);
  return <BudgetView key={month} data={data} month={month} />;
}

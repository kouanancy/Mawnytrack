import { BudgetView } from "@/components/BudgetView";
import { getMonthData } from "@/lib/data";
import { longDate, parsePeriod, periodEnd, periodName, periodRange, periodStatus } from "@/lib/period";
import { getPeriodSettings } from "@/lib/period-server";
import { requireUserId } from "@/lib/session";

export default async function Page({ searchParams }: { searchParams: Promise<{ m?: string | string[] }> }) {
  const [userId, { m }] = await Promise.all([requireUserId(), searchParams]);
  const ps = await getPeriodSettings(userId);
  const month = parsePeriod(m, ps);
  const data = await getMonthData(userId, month, []);
  // Mois clôturé, en cours (ouvert) ou prévu (préparation du budget)
  const status = periodStatus(month, ps);
  const end = periodEnd(month, ps);
  return (
    <BudgetView
      key={month}
      data={data}
      month={month}
      status={status}
      endLabel={status === "past" && end ? longDate(end) : null}
      period={`${periodName(month, ps)} · ${periodRange(month, ps)}`}
    />
  );
}

import { DepensesView } from "@/components/DepensesView";
import { getMonthData } from "@/lib/data";
import { APP_TZ, localDayTime } from "@/lib/month";
import { currentPeriod, parsePeriod, periodName, periodTitle } from "@/lib/period";
import { getPeriodSettings } from "@/lib/period-server";
import { requireUserId } from "@/lib/session";

export default async function Page({ searchParams }: { searchParams: Promise<{ m?: string | string[] }> }) {
  const [userId, { m }] = await Promise.all([requireUserId(), searchParams]);
  const ps = await getPeriodSettings(userId);
  const month = parsePeriod(m, ps);
  const data = await getMonthData(userId, month, ["expense", "refund"]);
  const current = month === currentPeriod(ps);
  return (
    <DepensesView
      key={month}
      data={data}
      month={month}
      monthName={periodName(month)}
      monthTitle={periodTitle(month, ps)}
      today={localDayTime(new Date(), APP_TZ).day}
      tz={APP_TZ}
      ps={ps}
      budgetHref={current ? "/budget" : `/budget?m=${month}`}
      revenusHref={current ? "/revenus" : `/revenus?m=${month}`}
    />
  );
}

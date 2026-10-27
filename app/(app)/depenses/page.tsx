import { DepensesView } from "@/components/DepensesView";
import { getMonthData } from "@/lib/data";
import { APP_TZ, currentMonth, localDayTime, monthLabel, parseMonth } from "@/lib/month";
import { requireUserId } from "@/lib/session";

export default async function Page({ searchParams }: { searchParams: Promise<{ m?: string | string[] }> }) {
  const [userId, { m }] = await Promise.all([requireUserId(), searchParams]);
  const month = parseMonth(m);
  const data = await getMonthData(userId, month, ["expense", "refund"]);
  return (
    <DepensesView
      key={month}
      data={data}
      month={month}
      monthName={monthLabel(month)}
      today={localDayTime(new Date(), APP_TZ).day}
      tz={APP_TZ}
      budgetHref={month === currentMonth() ? "/budget" : `/budget?m=${month}`}
    />
  );
}

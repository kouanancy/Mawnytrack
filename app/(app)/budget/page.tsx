import { BudgetView } from "@/components/BudgetView";
import { getMonthData } from "@/lib/data";
import { APP_TZ, localDayTime } from "@/lib/month";
import { currentPeriod, parsePeriod, periodEndLabel, periodName, periodRange, storedPeriod } from "@/lib/period";
import { getPeriodSettings } from "@/lib/period-server";
import { requireUserId } from "@/lib/session";

export default async function Page({ searchParams }: { searchParams: Promise<{ m?: string | string[] }> }) {
  const [userId, { m }] = await Promise.all([requireUserId(), searchParams]);
  const ps = await getPeriodSettings(userId);
  const month = parsePeriod(m, ps);
  const data = await getMonthData(userId, month, []);
  const current = currentPeriod(ps);
  const status = month < current ? "past" : month === current ? "current" : "future";
  // « Clôturer ce mois » : période en cours enregistrée
  const sp = status === "current" ? storedPeriod(month, ps) : null;
  const closing = sp ? { id: sp.id, start: sp.start, today: localDayTime(new Date(), APP_TZ).day } : null;
  return (
    <BudgetView
      key={month}
      data={data}
      month={month}
      status={status}
      endLabel={periodEndLabel(month, ps)}
      period={`${periodName(month, ps)} · ${periodRange(month, ps)}`}
      closing={closing}
    />
  );
}

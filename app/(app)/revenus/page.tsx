import { RevenusView } from "@/components/RevenusView";
import { getMonthData } from "@/lib/data";
import { APP_TZ, localDayTime } from "@/lib/month";
import { parsePeriod } from "@/lib/period";
import { getPeriodSettings } from "@/lib/period-server";
import { requireUserId } from "@/lib/session";

export default async function Page({ searchParams }: { searchParams: Promise<{ m?: string | string[] }> }) {
  const [userId, { m }] = await Promise.all([requireUserId(), searchParams]);
  const ps = await getPeriodSettings(userId);
  const month = parsePeriod(m, ps);
  const data = await getMonthData(userId, month, ["income", "borrow"]);
  return <RevenusView key={month} data={data} month={month} today={localDayTime(new Date(), APP_TZ).day} tz={APP_TZ} ps={ps} />;
}

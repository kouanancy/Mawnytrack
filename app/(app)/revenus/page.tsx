import { RevenusView } from "@/components/RevenusView";
import { getMonthData } from "@/lib/data";
import { APP_TZ, localDayTime, parseMonth } from "@/lib/month";
import { requireUserId } from "@/lib/session";

export default async function Page({ searchParams }: { searchParams: Promise<{ m?: string | string[] }> }) {
  const [userId, { m }] = await Promise.all([requireUserId(), searchParams]);
  const month = parseMonth(m);
  const data = await getMonthData(userId, month, ["income", "borrow"]);
  return <RevenusView key={month} data={data} month={month} today={localDayTime(new Date(), APP_TZ).day} tz={APP_TZ} />;
}

import { PretsView } from "@/components/PretsView";
import { getPeople } from "@/lib/loans";
import { APP_TZ, localDayTime } from "@/lib/month";
import { requireUserId } from "@/lib/session";

export default async function Page({ searchParams }: { searchParams: Promise<{ sens?: string }> }) {
  const [userId, { sens }] = await Promise.all([requireUserId(), searchParams]);
  const people = await getPeople(userId);
  return <PretsView people={people} dir={sens === "emprunte" ? "borrowed" : "lent"} today={localDayTime(new Date(), APP_TZ).day} />;
}

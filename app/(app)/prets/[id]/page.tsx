import { notFound } from "next/navigation";
import { PersonView } from "@/components/PersonView";
import { getPerson } from "@/lib/loans";
import { APP_TZ, localDayTime } from "@/lib/month";
import { requireUserId } from "@/lib/session";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const [userId, { id }] = await Promise.all([requireUserId(), params]);
  if (!UUID_RE.test(id)) notFound();
  const data = await getPerson(userId, id);
  if (!data) notFound();
  return <PersonView key={id} data={data} today={localDayTime(new Date(), APP_TZ).day} tz={APP_TZ} />;
}

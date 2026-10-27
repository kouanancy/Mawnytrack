import { notFound } from "next/navigation";
import { ProjectView } from "@/components/ProjectView";
import { getProject } from "@/lib/caisse";
import { APP_TZ } from "@/lib/month";
import { requireUserId } from "@/lib/session";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const [userId, { id }] = await Promise.all([requireUserId(), params]);
  if (!UUID_RE.test(id)) notFound();
  const data = await getProject(userId, id);
  if (!data) notFound();
  return <ProjectView key={id} data={data} tz={APP_TZ} />;
}

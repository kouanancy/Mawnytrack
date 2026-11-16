import { notFound } from "next/navigation";
import { ProjectCashView } from "@/components/ProjectCashView";
import { ProjectView } from "@/components/ProjectView";
import { getProject } from "@/lib/caisse";
import { APP_TZ, localDayTime } from "@/lib/month";
import { requireUserId } from "@/lib/session";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const [userId, { id }] = await Promise.all([requireUserId(), params]);
  if (!UUID_RE.test(id)) notFound();
  const data = await getProject(userId, id);
  if (!data) notFound();
  // Projet : caisse propre (approvisionnements, sorties, restitution) ; Investissement : sorties de caisse
  if (data.project.kind === "project")
    return (
      <ProjectCashView
        key={id}
        data={{ project: data.project, moves: data.moves, available: data.available }}
        today={localDayTime(new Date(), APP_TZ).day}
        tz={APP_TZ}
      />
    );
  return <ProjectView key={id} data={{ project: data.project, history: data.history, available: data.available }} tz={APP_TZ} />;
}

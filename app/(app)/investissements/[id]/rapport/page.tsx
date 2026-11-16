import { notFound } from "next/navigation";
import { ProjectReportView } from "@/components/ProjectReportView";
import { getProjectReport } from "@/lib/caisse";
import { APP_TZ, localDayTime } from "@/lib/month";
import { requireUserId } from "@/lib/session";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Rapport de la caisse d'un projet : complet, ou après une sortie (?apres=<identifiant de la sortie>). */
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ apres?: string }>;
}) {
  const [userId, { id }, { apres }] = await Promise.all([requireUserId(), params, searchParams]);
  if (!UUID_RE.test(id)) notFound();
  const data = await getProjectReport(userId, id);
  if (!data) notFound();
  return (
    <ProjectReportView
      id={data.id}
      name={data.name}
      moves={data.moves}
      after={typeof apres === "string" && UUID_RE.test(apres) ? apres : null}
      today={localDayTime(new Date(), APP_TZ).day}
    />
  );
}

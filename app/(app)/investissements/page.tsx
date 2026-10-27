import { InvestView } from "@/components/InvestView";
import { getProjects } from "@/lib/caisse";
import { requireUserId } from "@/lib/session";

export default async function Page() {
  const userId = await requireUserId();
  const { projects, available } = await getProjects(userId);
  return <InvestView projects={projects} available={available} />;
}

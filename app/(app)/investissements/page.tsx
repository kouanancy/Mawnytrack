import { InvestView } from "@/components/InvestView";
import { getProjects } from "@/lib/caisse";
import { requireUserId } from "@/lib/session";

export default async function Page() {
  const userId = await requireUserId();
  const { projects, available, budgets } = await getProjects(userId, true);
  return <InvestView projects={projects} budgets={budgets} available={available} />;
}

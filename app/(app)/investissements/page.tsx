import { InvestView } from "@/components/InvestView";
import { getProjects } from "@/lib/caisse";
import { requireUserId } from "@/lib/session";

/** Module Investissements ; ?vue=budgets ou ?vue=projets ouvre directement ce filtre (retour d'une fiche). */
export default async function Page({ searchParams }: { searchParams: Promise<{ vue?: string }> }) {
  const [userId, { vue }] = await Promise.all([requireUserId(), searchParams]);
  const { projects, available, budgets } = await getProjects(userId, true);
  const filter = vue === "budgets" ? "budgets" : vue === "projets" ? "projects" : "all";
  return <InvestView projects={projects} budgets={budgets} available={available} initialFilter={filter} />;
}

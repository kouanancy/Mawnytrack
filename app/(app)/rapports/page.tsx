import { ReportsList } from "@/components/ReportsList";
import { listReports } from "@/lib/report";
import { requireUserId } from "@/lib/session";

export default async function Page() {
  const userId = await requireUserId();
  return <ReportsList reports={await listReports(userId)} />;
}

import { notFound } from "next/navigation";
import { ReportView } from "@/components/ReportView";
import { getReport } from "@/lib/report";
import { requireUserId } from "@/lib/session";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const [userId, { id }] = await Promise.all([requireUserId(), params]);
  if (!UUID_RE.test(id)) notFound();
  const report = await getReport(userId, id);
  if (!report) notFound();
  return <ReportView id={report.id} data={report.data} sentAt={report.sentAt} />;
}

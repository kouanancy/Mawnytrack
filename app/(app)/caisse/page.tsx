import { CaisseView } from "@/components/CaisseView";
import { getCaisse } from "@/lib/caisse";
import { requireUserId } from "@/lib/session";

export default async function Page() {
  const userId = await requireUserId();
  return <CaisseView {...await getCaisse(userId)} />;
}

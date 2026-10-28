import { eq } from "drizzle-orm";
import { SettingsView } from "@/components/SettingsView";
import { db, schema } from "@/lib/db";
import { requireUser } from "@/lib/session";
import pkg from "@/package.json";

export default async function Page() {
  const user = await requireUser();
  const [row] = await db
    .select({
      theme: schema.userSettings.theme,
      weeklyEmail: schema.userSettings.weeklyEmail,
      startDay: schema.userSettings.startDay,
      naming: schema.userSettings.periodNaming,
    })
    .from(schema.userSettings)
    .where(eq(schema.userSettings.userId, user.id));
  return <SettingsView name={user.name} email={user.email} theme={row?.theme ?? "auto"} weeklyEmail={row?.weeklyEmail ?? true}
      period={{ startDay: row?.startDay ?? 1, naming: row?.naming ?? "end" }} version={pkg.version} />;
}

import { eq } from "drizzle-orm";
import { SettingsView } from "@/components/SettingsView";
import { db, schema } from "@/lib/db";
import { requireUser } from "@/lib/session";
import pkg from "@/package.json";

export default async function Page() {
  const user = await requireUser();
  const [row] = await db
    .select({ theme: schema.userSettings.theme })
    .from(schema.userSettings)
    .where(eq(schema.userSettings.userId, user.id));
  return <SettingsView name={user.name} email={user.email} theme={row?.theme ?? "auto"} version={pkg.version} />;
}

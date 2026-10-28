import { Suspense } from "react";
import { Header } from "@/components/Header";
import { Sidebar } from "@/components/Sidebar";
import { ToastProvider } from "@/components/Toast";
import { currentPeriod } from "@/lib/period";
import { getPeriodSettings } from "@/lib/period-server";
import { requireUserId } from "@/lib/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const userId = await requireUserId();
  // Mois ouvert par défaut : la période du mois budgétaire qui contient la date du jour
  const ps = await getPeriodSettings(userId);
  const current = currentPeriod(ps);
  return (
    <ToastProvider>
      <Suspense>
        <Sidebar current={current} />
      </Suspense>
      <div className="app">
        <Suspense>
          <Header current={current} ps={ps} />
        </Suspense>
        {children}
      </div>
    </ToastProvider>
  );
}

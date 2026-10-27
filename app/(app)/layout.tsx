import { Suspense } from "react";
import { Header } from "@/components/Header";
import { Sidebar } from "@/components/Sidebar";
import { ToastProvider } from "@/components/Toast";
import { currentMonth } from "@/lib/month";
import { requireUserId } from "@/lib/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireUserId();
  const current = currentMonth();
  return (
    <ToastProvider>
      <Suspense>
        <Sidebar current={current} />
      </Suspense>
      <div className="app">
        <Suspense>
          <Header current={current} />
        </Suspense>
        {children}
      </div>
    </ToastProvider>
  );
}

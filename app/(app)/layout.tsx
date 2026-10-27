import { Suspense } from "react";
import { Header } from "@/components/Header";
import { ToastProvider } from "@/components/Toast";
import { currentMonth } from "@/lib/month";
import { requireUserId } from "@/lib/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireUserId();
  return (
    <ToastProvider>
      <div className="app">
        <Suspense>
          <Header current={currentMonth()} />
        </Suspense>
        {children}
      </div>
    </ToastProvider>
  );
}

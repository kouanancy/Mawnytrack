import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Brand } from "@/components/Brand";
import { auth } from "@/lib/auth";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session) redirect("/depenses");
  return (
    <main className="auth">
      <div className="auth-brand">
        <Brand size={56} />
        <p>Suivi des finances personnelles</p>
      </div>
      {children}
    </main>
  );
}

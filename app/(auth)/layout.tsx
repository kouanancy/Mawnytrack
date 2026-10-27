import { Brand } from "@/components/Brand";

/** Pages d'authentification : bloc centré dans toute la fenêtre, sans barre latérale. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
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

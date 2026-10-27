"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PasswordInput } from "@/components/PasswordInput";
import { authClient } from "@/lib/auth-client";

/** Nouveau mot de passe à partir du lien reçu par e-mail (valable 1 heure, à usage unique). */
export function ResetForm({ token }: { token: string | null }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(token ? null : "Ce lien n'est plus valable. Demandez un nouveau lien.");
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!token) return;
    const f = new FormData(e.currentTarget);
    const password = String(f.get("password") ?? "");
    if (password.length < 8) return setError("Le mot de passe doit contenir au moins 8 caractères.");
    if (password !== f.get("confirm")) return setError("Les deux mots de passe ne correspondent pas.");
    setPending(true);
    setError(null);
    const { error } = await authClient.resetPassword({ newPassword: password, token });
    setPending(false);
    if (error) {
      setError(
        error.code === "INVALID_TOKEN"
          ? "Ce lien n'est plus valable (expiré ou déjà utilisé). Demandez un nouveau lien."
          : "Modification impossible. Réessayez.",
      );
      return;
    }
    setDone(true);
    setTimeout(() => router.replace("/connexion"), 2500);
  }

  return (
    <>
      <form className="quick" onSubmit={onSubmit} aria-label="Nouveau mot de passe">
        <h1>Nouveau mot de passe</h1>
        {token && !done && (
          <>
            <div className="field">
              <label htmlFor="password">Nouveau mot de passe</label>
              <PasswordInput id="password" name="password" autoComplete="new-password" required minLength={8} />
              <p className="hint" style={{ marginTop: 2 }}>8 caractères minimum.</p>
            </div>
            <div className="field">
              <label htmlFor="confirm">Confirmation du mot de passe</label>
              <PasswordInput id="confirm" name="confirm" autoComplete="new-password" required minLength={8} />
            </div>
          </>
        )}
        {done && (
          <p className="auth-ok" role="status">
            Mot de passe modifié. Redirection vers la connexion…
          </p>
        )}
        {error && (
          <p className="auth-err" role="alert">
            {error}
          </p>
        )}
        {token && !done && (
          <button className="btn" type="submit" disabled={pending}>
            {pending ? "Veuillez patienter…" : "Enregistrer le mot de passe"}
          </button>
        )}
      </form>
      <p className="auth-alt">
        {token && !error ? <Link href="/connexion">Retour à la connexion</Link> : <Link href="/mot-de-passe-oublie">Demander un nouveau lien</Link>}
      </p>
    </>
  );
}

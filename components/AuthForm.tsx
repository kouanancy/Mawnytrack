"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { syncThemeCookie } from "@/app/settings-actions";
import { PasswordInput } from "@/components/PasswordInput";
import { authClient } from "@/lib/auth-client";

const ERRORS: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "Adresse e-mail ou mot de passe incorrect.",
  INVALID_EMAIL: "Adresse e-mail invalide.",
  INVALID_PASSWORD: "Adresse e-mail ou mot de passe incorrect.",
  USER_ALREADY_EXISTS: "Un compte existe déjà avec cette adresse e-mail.",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "Un compte existe déjà avec cette adresse e-mail.",
  PASSWORD_TOO_SHORT: "Le mot de passe doit contenir au moins 8 caractères.",
  PASSWORD_TOO_LONG: "Le mot de passe est trop long.",
};

export function AuthForm({ mode, info }: { mode: "signin" | "signup"; info?: string }) {
  const signup = mode === "signup";
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const email = String(f.get("email") ?? "").trim();
    const password = String(f.get("password") ?? "");
    if (signup && password !== f.get("confirm")) {
      setError("Les deux mots de passe ne correspondent pas.");
      return;
    }
    setPending(true);
    setError(null);
    const { error } = signup
      ? await authClient.signUp.email({ email, password, name: email.split("@")[0] })
      : await authClient.signIn.email({ email, password });
    if (error) {
      setPending(false);
      setError(
        (error.code && ERRORS[error.code]) ||
          (error.status === 429 ? "Trop de tentatives. Réessayez dans un instant." : "Opération impossible. Réessayez."),
      );
      return;
    }
    await syncThemeCookie();
    router.replace("/depenses");
    router.refresh();
  }

  return (
    <>
      <form className="quick" onSubmit={onSubmit} aria-label={signup ? "Créer un compte" : "Connexion"}>
        <h1>{signup ? "Créer un compte" : "Connexion"}</h1>
        {info && (
          <p className="auth-ok" role="status">
            {info}
          </p>
        )}
        <div className="field">
          <label htmlFor="email">Adresse e-mail</label>
          <input id="email" name="email" type="email" autoComplete="email" required placeholder="nom@exemple.com" />
        </div>
        <div className="field">
          <label htmlFor="password">Mot de passe</label>
          <PasswordInput
            id="password"
            name="password"
            autoComplete={signup ? "new-password" : "current-password"}
            required
            minLength={signup ? 8 : undefined}
          />
          {signup && <p className="hint" style={{ marginTop: 2 }}>8 caractères minimum.</p>}
        </div>
        {signup && (
          <div className="field">
            <label htmlFor="confirm">Confirmation du mot de passe</label>
            <PasswordInput id="confirm" name="confirm" autoComplete="new-password" required minLength={8} />
          </div>
        )}
        {error && (
          <p className="auth-err" role="alert">
            {error}
          </p>
        )}
        <button className="btn" type="submit" disabled={pending}>
          {pending ? "Veuillez patienter…" : signup ? "Créer le compte" : "Se connecter"}
        </button>
      </form>
      {!signup && (
        <p className="auth-alt">
          <Link href="/mot-de-passe-oublie">Mot de passe oublié ?</Link>
        </p>
      )}
      <p className="auth-alt">
        {signup ? (
          <>
            Déjà un compte ? <Link href="/connexion">Se connecter</Link>
          </>
        ) : (
          <>
            Pas encore de compte ? <Link href="/inscription">Créer un compte</Link>
          </>
        )}
      </p>
    </>
  );
}

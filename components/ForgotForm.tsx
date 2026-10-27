"use client";

import Link from "next/link";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

/** Demande de lien de réinitialisation. Message identique que l'adresse existe ou non. */
export function ForgotForm() {
  const [state, setState] = useState<"idle" | "pending" | "sent" | "error">("idle");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = String(new FormData(e.currentTarget).get("email") ?? "").trim();
    setState("pending");
    const { error } = await authClient.requestPasswordReset({ email, redirectTo: "/nouveau-mot-de-passe" });
    // Seules les erreurs techniques (réseau, trop de tentatives) sont signalées : jamais l'existence du compte.
    setState(error && (error.status === 429 || !error.status || error.status >= 500) ? "error" : "sent");
  }

  return (
    <>
      <form className="quick" onSubmit={onSubmit} aria-label="Mot de passe oublié">
        <h1>Mot de passe oublié</h1>
        <p className="hint" style={{ margin: 0 }}>
          Saisissez l&apos;adresse e-mail du compte : un lien pour choisir un nouveau mot de passe y sera envoyé.
        </p>
        <div className="field">
          <label htmlFor="email">Adresse e-mail</label>
          <input id="email" name="email" type="email" autoComplete="email" required placeholder="nom@exemple.com" />
        </div>
        {state === "sent" && (
          <p className="auth-ok" role="status">
            Si un compte existe pour cette adresse, un e-mail vient d&apos;être envoyé. Le lien est valable 1 heure.
          </p>
        )}
        {state === "error" && (
          <p className="auth-err" role="alert">
            Envoi impossible pour le moment. Réessayez dans un instant.
          </p>
        )}
        <button className="btn" type="submit" disabled={state === "pending"}>
          {state === "pending" ? "Veuillez patienter…" : "Envoyer le lien"}
        </button>
      </form>
      <p className="auth-alt">
        <Link href="/connexion">Retour à la connexion</Link>
      </p>
    </>
  );
}

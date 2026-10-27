import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

/** Utilisateur connecté ; redirige vers la connexion sinon. Mis en cache par requête. */
export const requireUser = cache(async () => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/connexion");
  return session.user;
});

/** Identifiant de l'utilisateur connecté ; redirige vers la connexion sinon. */
export const requireUserId = async (): Promise<string> => (await requireUser()).id;

/** Variante pour les Server Actions : lève une erreur au lieu de rediriger. */
export async function actionUserId(): Promise<string> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new Error("Session expirée. Reconnectez-vous.");
  return session.user.id;
}

/**
 * Pages de connexion, d'inscription et de mot de passe oublié : renvoie vers Dépenses si une session
 * valide existe. Vérification en base (sans le cache du cookie) pour ne pas renvoyer une session révoquée.
 * La page de nouveau mot de passe reste accessible même connecté (lien reçu depuis les Réglages).
 */
export async function redirectIfSignedIn() {
  const session = await auth.api.getSession({ headers: await headers(), query: { disableCookieCache: true } });
  if (session) redirect("/depenses");
}

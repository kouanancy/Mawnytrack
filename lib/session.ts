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

import type { Metadata } from "next";
import { redirectIfSignedIn } from "@/lib/session";
import { AuthForm } from "@/components/AuthForm";

export const metadata: Metadata = { title: "Connexion · Mawnytrack" };

const INFO: Record<string, string> = {
  deconnexion: "Tous les appareils ont été déconnectés.",
  "compte-supprime": "Le compte et toutes ses données ont été supprimés.",
  "mot-de-passe": "Mot de passe modifié. Connectez-vous avec le nouveau mot de passe.",
};

export default async function Page({ searchParams }: { searchParams: Promise<{ info?: string }> }) {
  await redirectIfSignedIn();
  const { info } = await searchParams;
  return <AuthForm mode="signin" info={info ? INFO[info] : undefined} />;
}

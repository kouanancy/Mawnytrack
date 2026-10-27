import type { Metadata } from "next";
import { AuthForm } from "@/components/AuthForm";

export const metadata: Metadata = { title: "Connexion · Mawnytrack" };

const INFO: Record<string, string> = {
  deconnexion: "Tous les appareils ont été déconnectés.",
  "compte-supprime": "Le compte et toutes ses données ont été supprimés.",
};

export default async function Page({ searchParams }: { searchParams: Promise<{ info?: string }> }) {
  const { info } = await searchParams;
  return <AuthForm mode="signin" info={info ? INFO[info] : undefined} />;
}

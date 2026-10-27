import type { Metadata } from "next";
import { redirectIfSignedIn } from "@/lib/session";
import { ForgotForm } from "@/components/ForgotForm";

export const metadata: Metadata = { title: "Mot de passe oublié · Mawnytrack" };

export default async function Page() {
  await redirectIfSignedIn();
  return <ForgotForm />;
}

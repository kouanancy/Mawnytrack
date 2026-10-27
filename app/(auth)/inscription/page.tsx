import type { Metadata } from "next";
import { redirectIfSignedIn } from "@/lib/session";
import { AuthForm } from "@/components/AuthForm";

export const metadata: Metadata = { title: "Inscription · Mawnytrack" };

export default async function Page() {
  await redirectIfSignedIn();
  return <AuthForm mode="signup" />;
}

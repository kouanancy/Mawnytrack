import type { Metadata } from "next";
import { AuthForm } from "@/components/AuthForm";

export const metadata: Metadata = { title: "Connexion · Mawnytrack" };

export default function Page() {
  return <AuthForm mode="signin" />;
}

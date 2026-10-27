import type { Metadata } from "next";
import { ForgotForm } from "@/components/ForgotForm";

export const metadata: Metadata = { title: "Mot de passe oublié · Mawnytrack" };

export default function Page() {
  return <ForgotForm />;
}

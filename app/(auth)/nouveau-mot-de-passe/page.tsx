import type { Metadata } from "next";
import { ResetForm } from "@/components/ResetForm";

export const metadata: Metadata = { title: "Nouveau mot de passe · Mawnytrack" };

export default async function Page({ searchParams }: { searchParams: Promise<{ token?: string; error?: string }> }) {
  const { token, error } = await searchParams;
  return <ResetForm token={!error && typeof token === "string" && token ? token : null} />;
}

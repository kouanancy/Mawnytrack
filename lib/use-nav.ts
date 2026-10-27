"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { isValidMonth } from "@/lib/month";
import { sectionOf } from "@/lib/sections";

/** État de navigation partagé par l'en-tête (téléphone) et la barre latérale (grand écran). */
export function useNav(current: string) {
  const pathname = usePathname();
  const router = useRouter();
  const m = useSearchParams().get("m");
  const month = isValidMonth(m) ? m : current;
  // Le mois choisi suit la navigation entre sections ; le mois en cours n'apparaît pas dans l'URL.
  const withMonth = (href: string, mo: string = month) => (mo === current ? href : `${href}?m=${mo}`);
  async function signOut() {
    await authClient.signOut();
    router.replace("/connexion");
    router.refresh();
  }
  return { pathname, section: sectionOf(pathname), month, withMonth, signOut };
}

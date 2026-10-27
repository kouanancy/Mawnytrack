import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Figtree } from "next/font/google";
import { cookies } from "next/headers";
import { THEME_COOKIE } from "@/lib/theme";
import "./globals.css";

const display = Bricolage_Grotesque({ subsets: ["latin"], axes: ["opsz"], variable: "--font-bricolage", display: "swap" });
const body = Figtree({ subsets: ["latin"], variable: "--font-figtree", display: "swap" });

export const metadata: Metadata = {
  title: "Mawnytrack",
  description: "Suivi des finances personnelles en FCFA : dépenses, revenus et budget du mois.",
  applicationName: "Mawnytrack",
  icons: {
    icon: [
      { url: "/mawnytrack-icon.svg", type: "image/svg+xml" },
      { url: "/icons/icon-32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  appleWebApp: { capable: true, title: "Mawnytrack", statusBarStyle: "default" },
};

export async function generateViewport(): Promise<Viewport> {
  const theme = (await cookies()).get(THEME_COOKIE)?.value;
  const light = "#E9F0EC", dark = "#0B1714";
  return {
    width: "device-width",
    initialScale: 1,
    viewportFit: "cover",
    // Contrôles natifs, barres de défilement et fond initial suivent le thème (appareil ou choix des Réglages)
    colorScheme: theme === "light" ? "light" : theme === "dark" ? "dark" : "light dark",
    themeColor:
      theme === "light" || theme === "dark"
        ? theme === "light" ? light : dark
        : [
            { media: "(prefers-color-scheme: light)", color: light },
            { media: "(prefers-color-scheme: dark)", color: dark },
          ],
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Thème choisi dans les Réglages, posé dès le rendu serveur : aucun flash de la mauvaise couleur.
  const theme = (await cookies()).get(THEME_COOKIE)?.value;
  return (
    <html
      lang="fr"
      className={`${display.variable} ${body.variable}`}
      data-theme={theme === "light" || theme === "dark" ? theme : undefined}
    >
      <body>{children}</body>
    </html>
  );
}

import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Mawnytrack",
    short_name: "Mawnytrack",
    description: "Suivi des finances personnelles en FCFA.",
    lang: "fr",
    start_url: "/depenses",
    display: "standalone",
    background_color: "#E9F0EC",
    theme_color: "#0F3B32",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/mawnytrack-icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}

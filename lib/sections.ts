export type Section = { href: string; name: string; ready: boolean; month: boolean };

export const SECTIONS: Section[] = [
  { href: "/depenses", name: "Dépenses", ready: true, month: true },
  { href: "/revenus", name: "Revenus", ready: true, month: true },
  { href: "/budget", name: "Budget", ready: true, month: true },
  { href: "/prets", name: "Prêts", ready: true, month: false },
  { href: "/caisse", name: "Caisse", ready: true, month: false },
  { href: "/investissements", name: "Investissements", ready: true, month: false },
  { href: "/rapports", name: "Rapports", ready: true, month: false },
];

/** Réglages : en bas du menu et de la barre latérale, sans sélecteur de mois. */
export const SETTINGS: Section = { href: "/reglages", name: "Réglages", ready: true, month: false };

export const sectionOf = (pathname: string) =>
  [...SECTIONS, SETTINGS].find((s) => pathname.startsWith(s.href)) ?? SECTIONS[0];

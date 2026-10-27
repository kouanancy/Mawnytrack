export type Section = { href: string; name: string; ready: boolean; month: boolean };

export const SECTIONS: Section[] = [
  { href: "/depenses", name: "Dépenses", ready: true, month: true },
  { href: "/revenus", name: "Revenus", ready: true, month: true },
  { href: "/budget", name: "Budget", ready: true, month: true },
  { href: "/prets", name: "Prêts", ready: false, month: true },
  { href: "/caisse", name: "Caisse", ready: false, month: false },
  { href: "/investissements", name: "Investissements", ready: false, month: false },
];

export const sectionOf = (pathname: string) => SECTIONS.find((s) => pathname.startsWith(s.href)) ?? SECTIONS[0];

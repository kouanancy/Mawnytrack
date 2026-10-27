// Rapport hebdomadaire : données figées (enregistrées dans weekly_reports.data) et mise en forme commune
// à la page /rapports/[id], au PDF et à l'e-mail. Rien ici ne lit la base : tout part de WeeklyReport.
import { fmt } from "@/lib/format";
import { longDay, monthLabel } from "@/lib/month";

export type ReportLine = {
  label: string;
  group: "budget" | "lent" | "borrowed";
  week: number;
  month: number;
  planned: number;
  /** Reste du budget prévu (null : pas de plafond) */
  rest: number | null;
  exhausted: boolean;
};

export type ReportMove = { day: string; person: string; label: string; type: "loan" | "pay"; amount: number };

export type WeeklyReport = {
  version: 1;
  weekStart: string;
  weekEnd: string;
  /** Mois de référence pour « depuis le début du mois » */
  month: string;
  generatedAt: string;
  week: { income: number; borrow: number; expense: number; refund: number };
  monthToDate: { income: number; borrow: number; out: number; rest: number };
  debts: number;
  budget: ReportLine[];
  expenses: { day: string; time: string; label: string; line: string; amount: number }[];
  lent: { moves: ReportMove[]; people: { name: string; total: number; back: number; due: number }[] };
  borrowed: { moves: ReportMove[]; people: { name: string; total: number; back: number; due: number }[] };
  caisse: {
    available: number;
    outs: { day: string; project: string; label: string; amount: number }[];
    projects: { name: string; kind: "investment" | "project"; engaged: number; target: number }[];
  };
  hasMovements: boolean;
};

export type Align = "left" | "right";
export type SectionRow = { cells: (string | null)[]; style?: "normal" | "muted" | "group" | "total" | "alert" };
export type Section = {
  heading: string;
  note?: string;
  /** short : intitulé court affiché sur téléphone (la page), le PDF garde l'intitulé complet */
  columns: { label: string; short?: string; width: number; align?: Align }[];
  rows: SectionRow[];
  footer?: SectionRow[];
  empty: string;
};

const short = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;
const signed = (n: number) => (n < 0 ? `-${fmt(-n)}` : fmt(n));

export const reportPeriod = (r: Pick<WeeklyReport, "weekStart" | "weekEnd">) =>
  `du ${longDay(r.weekStart, true)} au ${longDay(r.weekEnd, true)}`;

/** Objet de l'e-mail : « Mawnytrack · Rapport du 20 octobre 2026 au 26 octobre 2026 ». */
export const reportSubject = (r: Pick<WeeklyReport, "weekStart" | "weekEnd">) =>
  `Mawnytrack · Rapport du ${longDay(r.weekStart)} au ${longDay(r.weekEnd)}`;

/** « Rapport-Mawnytrack-2026-10-26.pdf » (date du dimanche). */
export const reportFilename = (r: Pick<WeeklyReport, "weekEnd">) => `Rapport-Mawnytrack-${r.weekEnd}.pdf`;

/** Chiffres de la synthèse (page, PDF et corps de l'e-mail). */
export function reportSummary(r: WeeklyReport) {
  // « depuis le 1er octobre 2026 »
  const m = `1er ${monthLabel(r.month)}`;
  return {
    week: [
      ["Revenus de la semaine", fmt(r.week.income)],
      ["Emprunts reçus", fmt(r.week.borrow)],
      ["Dépenses de la semaine", signed(r.week.expense - r.week.refund)],
    ] as [string, string][],
    month: [
      [`Revenus depuis le ${m}`, fmt(r.monthToDate.income + r.monthToDate.borrow)],
      [`Dépenses depuis le ${m}`, signed(r.monthToDate.out)],
      ["Reste disponible", signed(r.monthToDate.rest)],
    ] as [string, string][],
    other: [
      ["Dettes en cours", fmt(r.debts)],
      ["Disponible en caisse", signed(r.caisse.available)],
    ] as [string, string][],
  };
}

/** Sections du rapport, dans l'ordre ; utilisées telles quelles par la page et par le PDF. */
export function reportSections(r: WeeklyReport): Section[] {
  const s = reportSummary(r);
  const kv = (rows: [string, string][]) => rows.map(([a, b]) => ({ cells: [a, b] }));
  const sections: Section[] = [];

  sections.push({
    heading: "Synthèse",
    columns: [
      { label: "Indicateur", width: 70 },
      { label: "Montant (FCFA)", short: "FCFA", width: 30, align: "right" },
    ],
    rows: [
      { cells: ["Cette semaine", null], style: "group" },
      ...kv(s.week),
      { cells: [`Depuis le 1er ${monthLabel(r.month)}`, null], style: "group" },
      ...kv(s.month),
      { cells: ["Situation actuelle", null], style: "group" },
      ...kv(s.other),
    ],
    empty: "",
  });

  const groups: [ReportLine["group"], string][] = [
    ["budget", "Budget"],
    ["lent", "Prêts accordés"],
    ["borrowed", "Remboursements d'emprunts"],
  ];
  const budgetRows: SectionRow[] = [];
  for (const [g, name] of groups) {
    const lines = r.budget.filter((l) => l.group === g);
    if (!lines.length) continue;
    budgetRows.push({ cells: [name, null, null, null, null], style: "group" });
    for (const l of lines)
      budgetRows.push({
        cells: [
          l.exhausted ? `${l.label} · épuisée` : l.label,
          signed(l.week),
          signed(l.month),
          l.planned ? fmt(l.planned) : "—",
          l.rest == null ? "Sans plafond" : l.exhausted ? "0" : fmt(l.rest),
        ],
        style: l.exhausted ? "alert" : undefined,
      });
  }
  const exhausted = r.budget.filter((l) => l.exhausted).length;
  sections.push({
    heading: "Budget",
    note: exhausted
      ? `${exhausted} ligne${exhausted > 1 ? "s" : ""} épuisée${exhausted > 1 ? "s" : ""} : aucune nouvelle dépense possible sans modifier le budget prévu.`
      : undefined,
    columns: [
      { label: "Ligne", width: 32 },
      { label: "Cette semaine", short: "Sem.", width: 17, align: "right" },
      { label: "Ce mois", width: 17, align: "right" },
      { label: "Budget prévu", short: "Prévu", width: 17, align: "right" },
      { label: "Reste", width: 17, align: "right" },
    ],
    rows: budgetRows,
    empty: "Aucune ligne de budget.",
  });

  const expRows: SectionRow[] = [];
  let lastDay = "";
  for (const e of r.expenses) {
    if (e.day !== lastDay) {
      lastDay = e.day;
      const label = longDay(e.day, true);
      expRows.push({ cells: [label.charAt(0).toUpperCase() + label.slice(1), null, null, null], style: "group" });
    }
    expRows.push({ cells: [`${short(e.day)} ${e.time}`, e.label, e.line, signed(e.amount)] });
  }
  const expTotal = r.expenses.reduce((a, e) => a + e.amount, 0);
  sections.push({
    heading: "Dépenses de la semaine",
    columns: [
      { label: "Date", width: 16 },
      { label: "Libellé", width: 38 },
      { label: "Ligne", width: 28 },
      { label: "Montant", width: 18, align: "right" },
    ],
    rows: expRows,
    footer: [{ cells: ["Total de la semaine", null, null, signed(expTotal)], style: "total" }],
    empty: "Aucune dépense cette semaine.",
  });

  const moves = (list: ReportMove[]): Section["rows"] =>
    list.map((m) => ({ cells: [short(m.day), m.person, m.label, m.type === "loan" ? fmt(m.amount) : "", m.type === "pay" ? fmt(m.amount) : ""] }));
  const moveCols = (loanLabel: string, who: string) => [
    { label: "Date", width: 11 },
    { label: who, width: 22 },
    { label: "Libellé", width: 33 },
    { label: loanLabel, width: 17, align: "right" as const },
    { label: "Remboursement", short: "Remb.", width: 17, align: "right" as const },
  ];
  const sum = (list: ReportMove[], t: ReportMove["type"]) => list.filter((m) => m.type === t).reduce((a, m) => a + m.amount, 0);
  const people = (list: WeeklyReport["lent"]["people"]) => list.map((p) => ({ cells: [p.name, fmt(p.total), fmt(p.back), fmt(p.due)] }));
  const peopleCols = (who: string, total: string, due: string) => [
    { label: who, width: 40 },
    { label: total, width: 20, align: "right" as const },
    { label: "Remboursé", short: "Remb.", width: 20, align: "right" as const },
    { label: due, short: "Reste", width: 20, align: "right" as const },
  ];

  sections.push({
    heading: "Prêts accordés · mouvements de la semaine",
    columns: moveCols("Prêt", "Personne"),
    rows: moves(r.lent.moves),
    footer: r.lent.moves.length
      ? [{ cells: ["Total de la semaine", null, null, fmt(sum(r.lent.moves, "loan")), fmt(sum(r.lent.moves, "pay"))], style: "total" }]
      : undefined,
    empty: "Aucun prêt ni remboursement cette semaine.",
  });
  sections.push({
    heading: "Prêts accordés · reste dû par personne",
    columns: peopleCols("Personne", "Prêté", "Reste dû"),
    rows: people(r.lent.people),
    footer: r.lent.people.length
      ? [{ cells: ["Total à recevoir", null, null, fmt(r.lent.people.reduce((a, p) => a + p.due, 0))], style: "total" }]
      : undefined,
    empty: "Aucune personne.",
  });
  sections.push({
    heading: "Emprunts · mouvements de la semaine",
    columns: moveCols("Emprunt", "Prêteur"),
    rows: moves(r.borrowed.moves),
    footer: r.borrowed.moves.length
      ? [{ cells: ["Total de la semaine", null, null, fmt(sum(r.borrowed.moves, "loan")), fmt(sum(r.borrowed.moves, "pay"))], style: "total" }]
      : undefined,
    empty: "Aucun emprunt ni remboursement cette semaine.",
  });
  sections.push({
    heading: "Dettes en cours · reste à rendre par prêteur",
    columns: peopleCols("Prêteur", "Emprunté", "Reste à rendre"),
    rows: people(r.borrowed.people),
    footer: r.borrowed.people.length ? [{ cells: ["Dettes en cours", null, null, fmt(r.debts)], style: "total" }] : undefined,
    empty: "Aucun emprunt.",
  });

  sections.push({
    heading: "Caisse · sorties de la semaine",
    note: `Disponible en caisse : ${signed(r.caisse.available)} FCFA`,
    columns: [
      { label: "Date", width: 12 },
      { label: "Projet", width: 34 },
      { label: "Libellé", width: 36 },
      { label: "Montant", width: 18, align: "right" },
    ],
    rows: r.caisse.outs.map((o) => ({ cells: [short(o.day), o.project, o.label, fmt(o.amount)] })),
    footer: r.caisse.outs.length
      ? [{ cells: ["Total de la semaine", null, null, fmt(r.caisse.outs.reduce((a, o) => a + o.amount, 0))], style: "total" }]
      : undefined,
    empty: "Aucune sortie de caisse cette semaine.",
  });
  sections.push({
    heading: "Investissements et projets en cours",
    columns: [
      { label: "Projet", width: 34 },
      { label: "Type", width: 18 },
      { label: "Engagé", width: 16, align: "right" },
      { label: "Nécessaire", short: "Néc.", width: 16, align: "right" },
      { label: "Avancement", short: "Avanc.", width: 16, align: "right" },
    ],
    rows: r.caisse.projects.map((p) => ({
      cells: [
        p.name,
        p.kind === "investment" ? "Investissement" : "Projet",
        fmt(p.engaged),
        fmt(p.target),
        `${p.target ? Math.floor((p.engaged / p.target) * 100) : 0} %`,
      ],
    })),
    empty: "Aucun projet en cours.",
  });
  return sections;
}

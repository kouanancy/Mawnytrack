import "server-only";
import { LineCapStyle, PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";

// Documents PDF imprimables (relevé de prêts, sorties filtrées), utilisés quand l'impression du navigateur
// n'est pas disponible (application installée sur l'écran d'accueil de l'iPhone, etc.).
// A4 portrait, marges de 15 mm, en-tête de tableau répété sur chaque page, aucune ligne coupée.
// Un PDF ne lit pas les variables CSS : comme pour les e-mails, la palette claire est écrite ici.

const hex = (h: string) => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
const C = { ink: hex("#0F2B25"), muted: hex("#4F635B"), line: hex("#D5E0DA"), soft: hex("#F3F7F5"), alert: hex("#C8372D"), accent: hex("#0B7A5C"), hero: hex("#0F3B32"), bar: hex("#7FE0B9"), out: hex("#F4A089") };

const PAGE_W = 595.28, PAGE_H = 841.89;
const M = (15 / 25.4) * 72; // 15 mm
const W = PAGE_W - 2 * M;

export type Column = { label: string; width: number; align?: "left" | "right" };
/** Cellule null : fusionnée avec la cellule précédente (colspan). */
/** group : titre de groupe ; subtotal : sous-total ; total / end : bas du tableau ; alert : ligne signalée (rouge). */
export type TableRow = { cells: (string | null)[]; style?: "normal" | "muted" | "bold" | "group" | "subtotal" | "total" | "end" | "alert" };

export type TableDoc = {
  title: string;
  /** Sous-titre sous le logo (ex. « Relevé de prêts ») */
  subtitle?: string;
  /** Bloc à droite de l'en-tête (ex. nom de la personne, mois) */
  right?: [string, string?];
  columns: Column[];
  rows: TableRow[];
  empty?: string;
  footer?: TableRow[];
};

/** Remplace les caractères absents de la police standard (WinAnsi). */
function safe(font: PDFFont, s: string) {
  const t = s.replace(/[−–]/g, "-").replace(/[   ]/g, " ");
  let out = "";
  for (const ch of t) {
    try {
      font.encodeText(ch);
      out += ch;
    } catch {
      out += "?";
    }
  }
  return out;
}

function wrap(font: PDFFont, size: number, text: string, width: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (font.widthOfTextAtSize(next, size) <= width) cur = next;
    else {
      if (cur) lines.push(cur);
      // Mot plus long que la colonne : coupé
      let rest = w;
      while (font.widthOfTextAtSize(rest, size) > width && rest.length > 1) {
        let k = rest.length - 1;
        while (k > 1 && font.widthOfTextAtSize(rest.slice(0, k), size) > width) k--;
        lines.push(rest.slice(0, k));
        rest = rest.slice(k);
      }
      cur = rest;
    }
  }
  if (cur || !lines.length) lines.push(cur);
  return lines;
}

function drawLogo(page: PDFPage, x: number, yTop: number, size: number) {
  const s = size / 64;
  page.drawSvgPath("M16 0 H48 A16 16 0 0 1 64 16 V48 A16 16 0 0 1 48 64 H16 A16 16 0 0 1 0 48 V16 A16 16 0 0 1 16 0 Z", {
    x, y: yTop, scale: s, color: C.hero,
  });
  const stroke = { x, y: yTop, scale: s, borderWidth: 6, borderLineCap: LineCapStyle.Round };
  page.drawSvgPath("M14 46 L14 22 L29 37 L50 16", { ...stroke, borderColor: C.bar });
  page.drawSvgPath("M39 16 L50 16 L50 27", { ...stroke, borderColor: C.out });
}

/** Un tableau d'un document à plusieurs sections (rapport hebdomadaire). */
export type TableSpec = { heading?: string; note?: string; columns: Column[]; rows: TableRow[]; empty?: string; footer?: TableRow[] };
export type MultiDoc = Omit<TableDoc, "columns" | "rows" | "empty" | "footer"> & { tables: TableSpec[] };

/** Document d'un seul tableau (relevé, sorties filtrées). */
export function tablePdf(doc: TableDoc): Promise<Uint8Array> {
  const { columns, rows, empty, footer, ...head } = doc;
  return documentPdf({ ...head, tables: [{ columns, rows, empty, footer }] });
}

/**
 * Document A4 portrait à une ou plusieurs sections : en-tête (logo, titre, bloc à droite) sur la première page,
 * puis chaque tableau avec son titre ; l'en-tête de colonnes est répété à chaque saut de page et aucune ligne
 * n'est coupée entre deux pages.
 */
export async function documentPdf(doc: MultiDoc): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(doc.title);
  pdf.setCreator("Mawnytrack");
  pdf.setLanguage("fr-FR");
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);

  const size = 10, lineH = 13, padY = 5, padX = 4;
  let page!: PDFPage;
  let y = 0;
  const pages: PDFPage[] = [];
  let table!: TableSpec;
  let widths: number[] = [];
  let xs: number[] = [];

  const newPage = () => {
    page = pdf.addPage([PAGE_W, PAGE_H]);
    pages.push(page);
    y = PAGE_H - M;
  };

  const docHeader = () => {
    drawLogo(page, M, y, 22);
    page.drawText("Mawny", { x: M + 28, y: y - 16, size: 15, font: bold, color: C.ink });
    page.drawText("track", { x: M + 28 + bold.widthOfTextAtSize("Mawny", 15), y: y - 16, size: 15, font: bold, color: C.accent });
    if (doc.subtitle) page.drawText(safe(regular, doc.subtitle), { x: M, y: y - 36, size: 10, font: regular, color: C.muted });
    if (doc.right) {
      const [a, b] = doc.right;
      const ta = safe(bold, a);
      page.drawText(ta, { x: M + W - bold.widthOfTextAtSize(ta, 12), y: y - 14, size: 12, font: bold, color: C.ink });
      if (b) {
        const tb = safe(regular, b);
        page.drawText(tb, { x: M + W - regular.widthOfTextAtSize(tb, 10), y: y - 30, size: 10, font: regular, color: C.muted });
      }
    }
    y -= doc.subtitle || doc.right ? 46 : 28;
    page.drawLine({ start: { x: M, y }, end: { x: M + W, y }, thickness: 1.5, color: C.ink });
    y -= 18;
    for (const l of wrap(bold, 13, safe(bold, doc.title), W)) {
      page.drawText(l, { x: M, y, size: 13, font: bold, color: C.ink });
      y -= 17;
    }
    y -= 4;
  };

  // En-tête de colonnes du tableau courant, répété sur chaque page
  const columnsHeader = () => {
    table.columns.forEach((c, i) => {
      const t = safe(bold, c.label.toUpperCase());
      const w = bold.widthOfTextAtSize(t, 8);
      const x = c.align === "right" ? xs[i] + widths[i] - padX - w : xs[i] + padX;
      page.drawText(t, { x, y: y - 10, size: 8, font: bold, color: C.muted });
    });
    y -= 16;
    page.drawLine({ start: { x: M, y }, end: { x: M + W, y }, thickness: 0.8, color: C.line });
  };

  const drawRow = (row: TableRow) => {
    const strong = row.style === "bold" || row.style === "group" || row.style === "subtotal" || row.style === "total" || row.style === "end" || row.style === "alert";
    const font = strong ? bold : row.style === "muted" ? italic : regular;
    const color =
      row.style === "muted" || row.style === "subtotal" ? C.muted : row.style === "group" ? C.accent : row.style === "alert" ? C.alert : C.ink;
    const fsize = row.style === "end" ? 11 : size;
    // Cellules fusionnées (null) : la largeur s'ajoute à la cellule précédente, qui garde son alignement
    const cells: { text: string; x: number; w: number; align: "left" | "right" }[] = [];
    row.cells.forEach((t, i) => {
      if (t === null && cells.length) cells[cells.length - 1].w += widths[i];
      else cells.push({ text: safe(font, t ?? ""), x: xs[i], w: widths[i], align: table.columns[i].align ?? "left" });
    });
    const lines = cells.map((c) => (c.align === "right" ? [c.text] : wrap(font, fsize, c.text, c.w - 2 * padX)));
    const h = Math.max(...lines.map((l) => l.length)) * lineH + 2 * padY;
    // Un titre de groupe n'est jamais laissé seul en bas de page
    if (y - h * (row.style === "group" ? 2 : 1) < M + 16) {
      newPage();
      columnsHeader();
    }
    if (row.style === "group") page.drawRectangle({ x: M, y: y - h, width: W, height: h, color: C.soft });
    if (row.style === "total") page.drawLine({ start: { x: M, y }, end: { x: M + W, y }, thickness: 1.5, color: C.ink });
    cells.forEach((c, k) => {
      lines[k].forEach((l, j) => {
        const w = font.widthOfTextAtSize(l, fsize);
        const x = c.align === "right" ? c.x + c.w - padX - w : c.x + padX;
        page.drawText(l, { x, y: y - padY - 10 - j * lineH, size: fsize, font, color });
      });
    });
    y -= h;
    if (row.style !== "total" && row.style !== "end") page.drawLine({ start: { x: M, y }, end: { x: M + W, y }, thickness: 0.5, color: C.line });
  };

  newPage();
  docHeader();
  doc.tables.forEach((t, ti) => {
    table = t;
    const total = t.columns.reduce((a, c) => a + c.width, 0);
    widths = t.columns.map((c) => (c.width / total) * W);
    xs = widths.map((_, i) => M + widths.slice(0, i).reduce((a, b) => a + b, 0));
    // Titre de section gardé avec l'en-tête du tableau et au moins une ligne
    const headH = (t.heading ? 22 : 0) + (t.note ? 14 : 0) + 16 + 24;
    if (ti > 0) y -= 14;
    if (y - headH < M + 16) newPage();
    if (t.heading) {
      page.drawText(safe(bold, t.heading), { x: M, y: y - 13, size: 12, font: bold, color: C.ink });
      y -= 20;
    }
    if (t.note) {
      page.drawText(safe(regular, t.note), { x: M, y: y - 9, size: 9, font: regular, color: C.muted });
      y -= 14;
    }
    columnsHeader();
    if (t.rows.length) t.rows.forEach(drawRow);
    else drawRow({ cells: [t.empty ?? "Aucun mouvement.", ...t.columns.slice(1).map(() => null)], style: "muted" });
    for (const r of t.footer ?? []) drawRow(r);
  });

  pages.forEach((p, i) => {
    const t = `Page ${i + 1} / ${pages.length}`;
    p.drawText(t, { x: M + W - regular.widthOfTextAtSize(t, 8), y: M - 14, size: 8, font: regular, color: C.muted });
  });
  return pdf.save();
}

export function pdfResponse(bytes: Uint8Array, filename: string) {
  return new Response(new Blob([bytes as BlobPart], { type: "application/pdf" }), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

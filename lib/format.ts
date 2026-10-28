/** Montant FCFA avec séparateur d'espace : 1 250 000 */
export function fmt(n: number): string {
  const s = String(Math.round(Math.abs(n))).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return n < 0 ? `−${s}` : s;
}

/** Montant insécable (espaces insécables) pour les phrases qui passent à la ligne : 1 250 000 */
export const fmtNb = (n: number) => fmt(n).replace(/ /g, "\u00a0");

/** Lecture d'un montant saisi (« 12 500 » → 12500). */
export function parseAmount(v: string | null | undefined): number {
  const n = parseInt(String(v ?? "").replace(/\D/g, ""), 10);
  return Number.isFinite(n) ? n : 0;
}

/** Montant formaté pendant la saisie. */
export function formatInput(v: string): string {
  const n = parseAmount(v);
  return n ? fmt(n) : "";
}

export const plural = (n: number, one: string, many: string) => (n > 1 ? many : one);

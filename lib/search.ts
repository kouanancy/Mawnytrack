// Recherche sans tenir compte des majuscules ni des accents (« electricite » trouve « Électricité »).

/** Texte normalisé : minuscules, sans accents. */
export const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Le libellé contient-il la recherche (vide : tout correspond) ? */
export const matches = (label: string, query: string) => !query.trim() || norm(label).includes(norm(query.trim()));

/**
 * Découpe d'un libellé pour mettre en gras les lettres tapées (première occurrence), en conservant les accents
 * d'origine : chaque caractère est normalisé séparément pour garder la correspondance des positions.
 */
export function matchParts(label: string, query: string): { text: string; hit: boolean }[] {
  const q = norm(query.trim());
  if (!q) return [{ text: label, hit: false }];
  const chars = [...label];
  let flat = "";
  const owner: number[] = [];
  chars.forEach((c, i) => {
    const n = norm(c);
    flat += n;
    for (let k = 0; k < n.length; k++) owner.push(i);
  });
  const at = flat.indexOf(q);
  if (at < 0) return [{ text: label, hit: false }];
  const from = owner[at], to = owner[at + q.length - 1] + 1;
  return [
    { text: chars.slice(0, from).join(""), hit: false },
    { text: chars.slice(from, to).join(""), hit: true },
    { text: chars.slice(to).join(""), hit: false },
  ].filter((p) => p.text);
}

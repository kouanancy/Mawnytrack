// Caisse propre aux éléments de type « Projet » : règles partagées par l'interface (contrôle pendant la saisie,
// mises à jour optimistes) et par le serveur (messages d'erreur ; les mêmes conditions sont vérifiées en SQL,
// app/(app)/investissements/actions.ts).
//   fund : approvisionnement depuis la caisse principale ; out : sortie ; back : restitution à la caisse principale.
//   Alloué = approvisionnements − restitutions ; solde du projet = alloué − sorties.
import { fmt } from "@/lib/format";
import type { Check } from "@/lib/ledger";

export type MoveType = "fund" | "out" | "back";

/** État d'un projet utile aux contrôles. available : disponible de la caisse principale. */
export type CashState = { target: number; allocated: number; balance: number; available: number; closed: boolean };

export const moveName: Record<MoveType, string> = {
  fund: "Approvisionnement",
  out: "Sortie",
  back: "Restitution à la caisse",
};

/**
 * Effet d'un mouvement dont le montant passe de old à amount (old = 0 : ajout ; amount = 0 : suppression)
 * sur l'alloué, le solde du projet et le disponible de la caisse principale.
 */
export function moveDeltas(type: MoveType, old: number, amount: number) {
  const alloc = type === "fund" ? amount - old : type === "back" ? old - amount : 0;
  const balance = type === "fund" ? amount - old : old - amount;
  return { alloc, balance, available: -alloc };
}

/** Applique un mouvement à l'état (mises à jour optimistes). */
export function applyMove(s: CashState, type: MoveType, old: number, amount: number): CashState {
  const d = moveDeltas(type, old, amount);
  return { ...s, allocated: s.allocated + d.alloc, balance: s.balance + d.balance, available: s.available + d.available };
}

const ok: Check = { ok: true, bad: false, hint: "" };
const bad = (hint: string): Check => ({ ok: false, bad: true, hint });

/**
 * Contrôle d'un mouvement (ajout, modification, suppression avec amount = 0). Règles : le solde du projet ne
 * devient jamais négatif, la caisse principale non plus, et l'alloué ne dépasse jamais le montant nécessaire.
 * Une modification qui n'aggrave pas la situation reste possible.
 */
export function checkProjectMove(s: CashState, type: MoveType, old: number, amount: number): Check {
  if (s.closed) return bad("Projet clôturé : lecture seule.");
  // Ajout sans montant : rien à contrôler ; montant 0 sur un mouvement existant = suppression
  if (!old && !amount) return { ok: false, bad: false, hint: "" };
  const del = amount === 0;
  const d = moveDeltas(type, old, amount);

  if (s.balance + d.balance < 0 && d.balance < 0) {
    if (del) return bad("Suppression impossible : le solde du projet deviendrait négatif.");
    if (type === "fund") return bad(`Le solde du projet deviendrait négatif : montant minimum ${fmt(old - s.balance)} FCFA.`);
    if (type === "out" && !old && s.balance <= 0) return bad("La caisse du projet est vide. Approvisionnez-la d'abord.");
    return bad(`Montant supérieur au solde du projet : maximum ${fmt(Math.max(0, s.balance + old))} FCFA.`);
  }
  if (s.available + d.available < 0 && d.available < 0) {
    if (del) return bad("Suppression impossible : la caisse principale n'a pas assez de disponible.");
    if (type === "back")
      return bad(`La caisse principale n'a que ${fmt(Math.max(0, s.available))} FCFA disponibles : montant minimum ${fmt(old - Math.max(0, s.available))} FCFA.`);
    if (!old && s.available <= 0) return bad("La caisse principale est vide : aucun approvisionnement possible.");
    return bad(`Montant supérieur au disponible de la caisse principale : maximum ${fmt(Math.max(0, s.available + old))} FCFA.`);
  }
  if (type === "fund" && s.allocated + d.alloc > s.target && d.alloc > 0) {
    const max = Math.max(0, s.target - (s.allocated - old));
    if (!max) return bad("Montant nécessaire déjà entièrement alloué. Augmentez le montant nécessaire pour continuer.");
    return bad(`Montant supérieur au reste à financer : maximum ${fmt(max)} FCFA. Augmentez le montant nécessaire pour continuer.`);
  }
  return ok;
}

/** Statut d'un projet : « Clôturé », « En préparation » (rien d'alloué) ou « En cours ». */
export function projectStatus(p: { closed: boolean; engaged: number }): [string, string] {
  if (p.closed) return ["ok", "Clôturé"];
  return p.engaged > 0 ? ["prog", "En cours"] : ["run", "En préparation"];
}

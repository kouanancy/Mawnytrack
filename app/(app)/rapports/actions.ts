"use server";

import { revalidatePath } from "next/cache";
import { currentWeekStart, generateReport } from "@/lib/report";
import { actionUserId } from "@/lib/session";

/** Génère (ou met à jour) le rapport de la semaine en cours, sans attendre dimanche. */
export async function generateCurrentWeek(): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const userId = await actionUserId();
  try {
    const { id } = await generateReport(userId, currentWeekStart());
    revalidatePath("/rapports");
    return { ok: true, id };
  } catch {
    return { ok: false, error: "Le rapport n'a pas pu être généré. Réessayez." };
  }
}

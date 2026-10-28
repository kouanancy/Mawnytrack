"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { appOrigin } from "@/lib/origin";
import { currentWeekStart, generateReport, sendReport } from "@/lib/report";
import { currentPeriod, isStartDay, periodName, periodSpan } from "@/lib/period";
import { getPeriodSettings } from "@/lib/period-server";
import { THEME_COOKIE, isTheme, type Theme } from "@/lib/theme";
import { actionUserId } from "@/lib/session";

export type SettingsResult = { ok: true; message: string } | { ok: false; error: string };

const ok = (message: string): SettingsResult => ({ ok: true, message });
const fail = (error: string): SettingsResult => ({ ok: false, error });
/** Mot à saisir pour confirmer une réinitialisation ou une suppression. */
const CONFIRM_WORD = "RÉINITIALISER";
const YEAR = 60 * 60 * 24 * 365;

async function writeThemeCookie(theme: Theme) {
  const jar = await cookies();
  if (theme === "auto") jar.delete(THEME_COOKIE);
  else jar.set(THEME_COOKIE, theme, { path: "/", maxAge: YEAR, sameSite: "lax", httpOnly: true, secure: !!process.env.VERCEL });
}

/** Efface les cookies de session (Better Auth) et de thème : utilisé après la suppression du compte. */
async function clearAuthCookies() {
  const jar = await cookies();
  for (const c of jar.getAll()) {
    if (/^(__Secure-|__Host-)?better-auth\./.test(c.name) || c.name === THEME_COOKIE) {
      // Un cookie préfixé __Secure-/__Host- ne peut être effacé qu'avec l'attribut Secure.
      const secure = /^__(Secure|Host)-/.test(c.name);
      jar.set(c.name, "", { path: "/", maxAge: 0, secure, httpOnly: true, sameSite: "lax" });
    }
  }
}

/** Double confirmation : mot « RÉINITIALISER » et mot de passe actuel, vérifié côté serveur. */
async function confirmSensitive(word: unknown, password: unknown): Promise<string | null> {
  if (typeof word !== "string" || word.trim().toLocaleUpperCase("fr-FR") !== CONFIRM_WORD)
    return `Saisissez le mot « ${CONFIRM_WORD} » pour confirmer.`;
  if (typeof password !== "string" || !password) return "Saisissez votre mot de passe.";
  try {
    await auth.api.verifyPassword({ body: { password }, headers: await headers() });
    return null;
  } catch {
    return "Mot de passe incorrect.";
  }
}

/* ---------- Apparence ---------- */

/** Recopie dans le cookie le thème enregistré en base (après connexion sur un nouvel appareil). */
export async function syncThemeCookie(): Promise<void> {
  const userId = await actionUserId().catch(() => null);
  if (!userId) return;
  const [row] = await db
    .select({ theme: schema.userSettings.theme })
    .from(schema.userSettings)
    .where(eq(schema.userSettings.userId, userId));
  await writeThemeCookie(row?.theme ?? "auto");
}

export async function setTheme(theme: Theme): Promise<SettingsResult> {
  const userId = await actionUserId();
  if (!isTheme(theme)) return fail("Thème invalide.");
  await db
    .insert(schema.userSettings)
    .values({ userId, theme })
    .onConflictDoUpdate({ target: schema.userSettings.userId, set: { theme, updatedAt: sql`now()` } });
  await writeThemeCookie(theme);
  revalidatePath("/", "layout");
  return ok(
    theme === "auto" ? "Thème automatique : l'affichage suit le réglage de l'appareil." : theme === "light" ? "Thème clair appliqué." : "Thème sombre appliqué.",
  );
}

/* ---------- Notifications ---------- */

export async function setWeeklyEmail(on: boolean): Promise<SettingsResult> {
  const userId = await actionUserId();
  const value = on === true;
  await db
    .insert(schema.userSettings)
    .values({ userId, weeklyEmail: value })
    .onConflictDoUpdate({ target: schema.userSettings.userId, set: { weeklyEmail: value, updatedAt: sql`now()` } });
  return ok(value ? "Le rapport hebdomadaire sera envoyé chaque dimanche à 20 h." : "Le rapport hebdomadaire ne sera plus envoyé par e-mail.");
}

/** Rapport d'essai : celui de la semaine en cours, enregistré puis envoyé à l'adresse du compte. */
export async function sendTestReport(): Promise<SettingsResult> {
  const userId = await actionUserId();
  const user = (await auth.api.getSession({ headers: await headers() }))?.user;
  if (!user) return fail("Session expirée. Reconnectez-vous.");
  try {
    const report = await generateReport(userId, currentWeekStart());
    const sent = await sendReport({ email: user.email, reportId: report.id, data: report.data, origin: await appOrigin() });
    if (!sent) return fail("L'e-mail n'a pas pu être envoyé. Réessayez dans un instant.");
    revalidatePath("/rapports");
    return ok(`Rapport d'essai envoyé à ${user.email}.`);
  } catch {
    return fail("Le rapport n'a pas pu être préparé. Réessayez.");
  }
}

/* ---------- Mois budgétaire ---------- */

/**
 * Enregistre le début du mois budgétaire. Aucune transaction n'est modifiée : seules les périodes de
 * regroupement changent. Les budgets figés (monthly_budgets) étant rattachés aux anciennes périodes, ils sont
 * effacés dans la même transaction et refigés selon les nouvelles périodes à la consultation suivante.
 */
export async function setBudgetPeriod(input: { startDay: number; naming: string }): Promise<SettingsResult> {
  const userId = await actionUserId();
  const { startDay, naming } = input;
  if (!isStartDay(startDay)) return fail("Choisissez un jour entre le 1er et le 28.");
  if (naming !== "end" && naming !== "start") return fail("Choix du nom de la période invalide.");
  const before = await getPeriodSettings(userId);
  if (before.startDay === startDay && before.naming === naming) return ok("Mois budgétaire inchangé.");
  await db.batch([
    db
      .insert(schema.userSettings)
      .values({ userId, startDay, periodNaming: naming })
      .onConflictDoUpdate({ target: schema.userSettings.userId, set: { startDay, periodNaming: naming, updatedAt: sql`now()` } }),
    db.execute(sql`delete from monthly_budgets where user_id = ${userId}`),
  ]);
  revalidatePath("/", "layout");
  const ps = { startDay, naming } as const;
  const key = currentPeriod(ps);
  return ok(`Mois budgétaire enregistré. Mois en cours : ${periodName(key)}, ${periodSpan(key, ps)}.`);
}

/* ---------- Profil ---------- */

export async function updateName(name: string): Promise<SettingsResult> {
  await actionUserId();
  const clean = typeof name === "string" ? name.trim().replace(/\s+/g, " ").slice(0, 80) : "";
  if (!clean) return fail("Indiquez un nom.");
  await auth.api.updateUser({ body: { name: clean }, headers: await headers() });
  revalidatePath("/reglages");
  return ok("Nom enregistré.");
}

export async function updateEmail(email: string): Promise<SettingsResult> {
  const userId = await actionUserId();
  const clean = typeof email === "string" ? email.trim().toLowerCase() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean) || clean.length > 254) return fail("Adresse e-mail invalide.");
  try {
    await auth.api.changeEmail({ body: { newEmail: clean }, headers: await headers() });
  } catch (err) {
    return fail(String((err as Error).message).includes("same") ? "Cette adresse est déjà celle du compte." : "Modification impossible. Réessayez.");
  }
  // Better Auth ne signale pas une adresse déjà prise (pour ne pas révéler les comptes) : vérification du résultat.
  const [u] = await db.select({ email: schema.users.email }).from(schema.users).where(eq(schema.users.id, userId));
  if (u?.email !== clean) return fail("Cette adresse ne peut pas être utilisée. Choisissez-en une autre.");
  revalidatePath("/reglages");
  return ok("Adresse e-mail modifiée. Elle sert désormais à la connexion.");
}

/* ---------- Sécurité ---------- */

/**
 * Envoie à l'adresse du compte le lien de changement de mot de passe (même flux que « Mot de passe oublié ? »).
 * Le mot de passe ne se modifie que par ce lien.
 */
export async function sendPasswordLink(): Promise<SettingsResult> {
  await actionUserId();
  const user = (await auth.api.getSession({ headers: await headers() }))?.user;
  if (!user) return fail("Session expirée. Reconnectez-vous.");
  try {
    await auth.api.requestPasswordReset({ body: { email: user.email, redirectTo: "/nouveau-mot-de-passe" }, headers: await headers() });
  } catch {
    return fail("Envoi impossible pour le moment. Réessayez dans un instant.");
  }
  return ok(`Un e-mail vient d'être envoyé à ${user.email}. Le lien est valable 1 heure.`);
}

/** Ferme toutes les sessions, y compris celle-ci, puis renvoie vers la connexion. */
export async function signOutEverywhere(): Promise<SettingsResult> {
  await actionUserId();
  await auth.api.revokeSessions({ headers: await headers() });
  await clearAuthCookies();
  // Redirection côté serveur : la page de connexion affiche la confirmation.
  redirect("/connexion?info=deconnexion");
}

/* ---------- Données ---------- */

/**
 * Remise à zéro complète, comme pour une première utilisation : toutes les données de l'utilisateur
 * sont supprimées dans une seule transaction ; seuls l'e-mail et le mot de passe sont conservés.
 * Les autres appareils sont ensuite déconnectés.
 */
export async function resetAccount(input: { word: string; password: string }): Promise<SettingsResult> {
  const userId = await actionUserId();
  const err = await confirmSensitive(input.word, input.password);
  if (err) return fail(err);
  // Ordre compatible avec les clés étrangères ; db.batch = une transaction.
  await db.batch([
    db.execute(sql`delete from transactions where user_id = ${userId}`),
    db.execute(sql`delete from project_disbursements where user_id = ${userId}`),
    db.execute(sql`delete from projects where user_id = ${userId}`),
    db.execute(sql`delete from monthly_budgets where user_id = ${userId}`),
    db.execute(sql`delete from budget_lines where user_id = ${userId}`),
    db.execute(sql`delete from people where user_id = ${userId}`),
    db.execute(sql`delete from weekly_reports where user_id = ${userId}`),
    db.execute(sql`delete from user_settings where user_id = ${userId}`),
  ]);
  await auth.api.revokeOtherSessions({ headers: await headers() });
  await writeThemeCookie("auto");
  revalidatePath("/", "layout");
  return ok("Compte réinitialisé : toutes les données ont été supprimées.");
}

/* ---------- Compte ---------- */

/** Supprime le compte et, par cascade, toutes ses données (sessions comprises), en une seule instruction. */
export async function deleteAccount(input: { word: string; password: string }): Promise<SettingsResult> {
  const userId = await actionUserId();
  const err = await confirmSensitive(input.word, input.password);
  if (err) return fail(err);
  await db.delete(schema.users).where(eq(schema.users.id, userId));
  await clearAuthCookies();
  redirect("/connexion?info=compte-supprime");
}

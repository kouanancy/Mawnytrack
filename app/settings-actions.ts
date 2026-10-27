"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { THEME_COOKIE, isTheme, type Theme } from "@/lib/theme";
import { actionUserId } from "@/lib/session";

export type SettingsResult = { ok: true; message: string } | { ok: false; error: string };

const ok = (message: string): SettingsResult => ({ ok: true, message });
const fail = (error: string): SettingsResult => ({ ok: false, error });
/** Mot à saisir pour confirmer une réinitialisation ou une suppression. */
const CONFIRM_WORD = "RÉINITIALISER";
const YEAR = 60 * 60 * 24 * 365;

/** Code d'erreur Better Auth (APIError) éventuel. */
function codeOf(err: unknown): string | undefined {
  const e = err as { body?: { code?: string }; code?: string };
  return e?.body?.code ?? e?.code;
}

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

export async function changePassword(input: { current: string; next: string; confirm: string }): Promise<SettingsResult> {
  await actionUserId();
  if (!input.current) return fail("Saisissez le mot de passe actuel.");
  if (typeof input.next !== "string" || input.next.length < 8) return fail("Le nouveau mot de passe doit contenir au moins 8 caractères.");
  if (input.next !== input.confirm) return fail("Les deux nouveaux mots de passe ne correspondent pas.");
  try {
    await auth.api.changePassword({
      body: { currentPassword: input.current, newPassword: input.next, revokeOtherSessions: true },
      headers: await headers(),
    });
  } catch (err) {
    const code = codeOf(err);
    if (code === "INVALID_PASSWORD") return fail("Mot de passe actuel incorrect.");
    if (code === "PASSWORD_TOO_LONG") return fail("Le nouveau mot de passe est trop long.");
    return fail("Modification impossible. Réessayez.");
  }
  return ok("Mot de passe modifié. Les autres appareils ont été déconnectés.");
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

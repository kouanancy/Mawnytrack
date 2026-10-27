import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { after } from "next/server";
import { db, schema } from "@/lib/db";
import { resetPasswordEmail, sendEmail } from "@/lib/email";

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,
  // URL fixe si BETTER_AUTH_URL est défini, sinon déduite de l'hôte (Vercel : production et aperçus).
  baseURL: process.env.BETTER_AUTH_URL ?? {
    allowedHosts: ["*.vercel.app", "localhost:*", "127.0.0.1:*"],
  },
  database: drizzleAdapter(db, {
    provider: "pg",
    usePlural: true,
    schema: {
      users: schema.users,
      sessions: schema.sessions,
      accounts: schema.accounts,
      verifications: schema.verifications,
    },
  }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    autoSignIn: true,
    // Mot de passe oublié : lien valable 1 heure, à usage unique ; les autres sessions sont fermées après usage.
    // L'envoi part en tâche de fond : la réponse est identique que l'adresse existe ou non.
    resetPasswordTokenExpiresIn: 60 * 60,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      await sendEmail({ to: user.email, ...resetPasswordEmail(url) });
    },
  },
  user: {
    // Comptes sans vérification d'e-mail : l'adresse est modifiée immédiatement depuis les Réglages.
    changeEmail: { enabled: true, updateEmailWithoutVerification: true },
  },
  session: {
    // Session lue depuis un cookie signé pendant 1 min : pas de requête SQL à chaque page,
    // et une déconnexion à distance prend effet en moins d'une minute.
    cookieCache: { enabled: true, maxAge: 60 },
  },
  advanced: {
    trustedProxyHeaders: !!process.env.VERCEL,
    backgroundTasks: { handler: (promise) => after(promise) },
  },
  plugins: [nextCookies()],
});

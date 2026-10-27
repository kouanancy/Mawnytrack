import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db, schema } from "@/lib/db";

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
  },
  session: {
    // Session lue depuis un cookie signé pendant 5 min : pas de requête SQL à chaque page.
    cookieCache: { enabled: true, maxAge: 5 * 60 },
  },
  advanced: {
    trustedProxyHeaders: !!process.env.VERCEL,
  },
  plugins: [nextCookies()],
});

// Miroir Drizzle des migrations SQL (db/migrations). Les migrations font foi :
// toute évolution passe par un nouveau fichier SQL, puis par une mise à jour de ce fichier.
import { sql } from "drizzle-orm";
import { bigint, boolean, date, integer, jsonb, pgTable, smallint, text, timestamp, uuid } from "drizzle-orm/pg-core";

const tstz = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const money = (name: string) => bigint(name, { mode: "number" });

/* ---------- Better Auth ---------- */
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: tstz("created_at").notNull().defaultNow(),
  updatedAt: tstz("updated_at").notNull().defaultNow(),
});

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  expiresAt: tstz("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: tstz("created_at").notNull().defaultNow(),
  updatedAt: tstz("updated_at").notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
});

export const accounts = pgTable("accounts", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: tstz("access_token_expires_at"),
  refreshTokenExpiresAt: tstz("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: tstz("created_at").notNull().defaultNow(),
  updatedAt: tstz("updated_at").notNull().defaultNow(),
});

export const verifications = pgTable("verifications", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: tstz("expires_at").notNull(),
  createdAt: tstz("created_at").notNull().defaultNow(),
  updatedAt: tstz("updated_at").notNull().defaultNow(),
});

/* ---------- Application ---------- */
export const people = pgTable("people", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  direction: text("direction", { enum: ["lent", "borrowed"] }).notNull(),
  createdAt: tstz("created_at").notNull().defaultNow(),
});

export const budgetLines = pgTable("budget_lines", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("user_id").notNull(),
  label: text("label").notNull(),
  planned: money("planned").notNull().default(0),
  personId: uuid("person_id"),
  position: integer("position").notNull().default(0),
  createdAt: tstz("created_at").notNull().defaultNow(),
  /** Ligne système (008) : 'unlisted' = « Dépenses non répertoriées », ni supprimable ni renommable, budget 0 */
  system: text("system", { enum: ["unlisted"] }),
});

export const monthlyBudgets = pgTable("monthly_budgets", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("user_id").notNull(),
  lineId: uuid("line_id").notNull(),
  month: date("month", { mode: "string" }).notNull(),
  planned: money("planned").notNull(),
  /** Période du budget figé (008) */
  periodId: uuid("period_id"),
});

/** Mois budgétaires (008) : dates d'ouverture et de clôture, sans trou ni chevauchement (contraintes en base). */
export const budgetPeriods = pgTable("budget_periods", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("user_id").notNull(),
  /** Clé : 1er jour du mois de la clé (comme monthly_budgets.month) */
  month: date("month", { mode: "string" }).notNull(),
  name: text("name"),
  startDate: date("start_date", { mode: "string" }).notNull(),
  /** NULL : mois en cours, ouvert jusqu'à sa clôture (010) */
  endDate: date("end_date", { mode: "string" }),
  closedAt: tstz("closed_at"),
  createdAt: tstz("created_at").notNull().defaultNow(),
});

export const transactions = pgTable("transactions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("user_id").notNull(),
  kind: text("kind", { enum: ["income", "expense", "refund", "borrow"] }).notNull(),
  amount: money("amount").notNull(),
  label: text("label").notNull().default(""),
  lineId: uuid("line_id"),
  personId: uuid("person_id"),
  occurredAt: tstz("occurred_at").notNull().defaultNow(),
  createdAt: tstz("created_at").notNull().defaultNow(),
});

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  kind: text("kind", { enum: ["investment", "project"] }).notNull(),
  target: money("target").notNull().default(0),
  createdAt: tstz("created_at").notNull().defaultNow(),
  closedAt: tstz("closed_at"),
});

export const projectDisbursements = pgTable("project_disbursements", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("user_id").notNull(),
  projectId: uuid("project_id").notNull(),
  amount: money("amount").notNull(),
  label: text("label").notNull().default(""),
  occurredAt: tstz("occurred_at").notNull().defaultNow(),
  createdAt: tstz("created_at").notNull().defaultNow(),
});

/** Caisse d'un projet (007) : fund = approvisionnement, out = sortie, back = restitution à la caisse principale */
export const projectMoves = pgTable("project_moves", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("user_id").notNull(),
  projectId: uuid("project_id").notNull(),
  type: text("type", { enum: ["fund", "out", "back"] }).notNull(),
  amount: money("amount").notNull(),
  label: text("label").notNull().default(""),
  occurredAt: tstz("occurred_at").notNull().defaultNow(),
  createdAt: tstz("created_at").notNull().defaultNow(),
});

export const userSettings = pgTable("user_settings", {
  userId: text("user_id").primaryKey(),
  theme: text("theme", { enum: ["auto", "light", "dark"] }).notNull().default("auto"),
  weeklyEmail: boolean("weekly_email").notNull().default(true),
  startDay: smallint("start_day").notNull().default(1),
  periodNaming: text("period_naming", { enum: ["end", "start"] }).notNull().default("end"),
  updatedAt: tstz("updated_at").notNull().defaultNow(),
});

export const weeklyReports = pgTable("weekly_reports", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("user_id").notNull(),
  weekStart: date("week_start", { mode: "string" }).notNull(),
  weekEnd: date("week_end", { mode: "string" }).notNull(),
  generatedAt: tstz("generated_at").notNull().defaultNow(),
  sentAt: tstz("sent_at"),
  data: jsonb("data").notNull(),
});

/** Budgets d'événement (009) : listes indépendantes de la caisse, du budget mensuel et des dépenses. */
export const eventBudgets = pgTable("event_budgets", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  eventDate: date("event_date", { mode: "string" }),
  notes: text("notes").notNull().default(""),
  createdAt: tstz("created_at").notNull().defaultNow(),
});

/** Article d'un budget d'événement : montant total seulement, classé par catégorie, ordre libre (position). */
export const eventBudgetItems = pgTable("event_budget_items", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  budgetId: uuid("budget_id").notNull(),
  userId: text("user_id").notNull(),
  category: text("category").notNull(),
  label: text("label").notNull(),
  amount: money("amount").notNull(),
  position: integer("position").notNull().default(0),
});

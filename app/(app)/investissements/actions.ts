"use server";

import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { caisseAvailableSql } from "@/lib/caisse";
import { getPeriodSettings } from "@/lib/period-server";
import { db } from "@/lib/db";
import { fmt } from "@/lib/format";
import { actionUserId } from "@/lib/session";

// Investissements et projets, financés uniquement par la caisse. Les sorties (project_disbursements)
// ne touchent ni le budget, ni les dépenses, ni le reste disponible du mois.

export type ProjectResult = { ok: true; id?: string } | { ok: false; error: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_AMOUNT = 1_000_000_000_000;
type Row = Record<string, unknown>;
const rowsOf = (r: unknown) => (r as { rows: Row[] }).rows;
const fail = (error: string): ProjectResult => ({ ok: false, error });
const isAmount = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) > 0 && (v as number) <= MAX_AMOUNT;
const clean = (v: unknown, max: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : "");
const isId = (v: unknown): v is string => typeof v === "string" && UUID_RE.test(v);

/** Verrou par utilisateur : les sorties de caisse et les changements de montant nécessaire passent un par un. */
const lockCaisse = (userId: string) =>
  db.execute(sql`select pg_advisory_xact_lock(hashtextextended(${"caisse:" + userId}, 0))`);

function done(id?: string): ProjectResult {
  revalidatePath("/", "layout");
  return { ok: true, id };
}

export async function createProject(input: { name: string; kind: string; target: number }): Promise<ProjectResult> {
  const userId = await actionUserId();
  const name = clean(input.name, 80);
  if (!name) return fail("Indiquez un nom.");
  if (input.kind !== "investment" && input.kind !== "project") return fail("Type invalide.");
  if (!isAmount(input.target)) return fail("Indiquez le montant nécessaire.");
  const res = await db.execute(sql`
    insert into projects (user_id, name, kind, target) values (${userId}, ${name}, ${input.kind}, ${input.target}::bigint)
    returning id`);
  return done(String(rowsOf(res)[0].id));
}

/** Montant nécessaire : jamais en dessous de l'engagé. */
export async function setTarget(input: { id: string; target: number }): Promise<ProjectResult> {
  const userId = await actionUserId();
  if (!isId(input.id)) return fail("Élément introuvable.");
  if (!isAmount(input.target)) return fail("Indiquez le montant nécessaire.");
  const [, res] = await db.batch([
    lockCaisse(userId),
    db.execute(sql`
      with e as (
        select coalesce(sum(amount), 0) as engaged from project_disbursements
        where user_id = ${userId} and project_id = ${input.id}
      ), up as (
        update projects set target = ${input.target}::bigint
        where id = ${input.id} and user_id = ${userId} and ${input.target}::bigint >= (select engaged from e)
        returning id
      )
      select e.engaged, (select count(*) from up) as updated,
        exists (select 1 from projects where id = ${input.id} and user_id = ${userId}) as found
      from e`),
  ]);
  const r = rowsOf(res)[0];
  if (!r?.found) return fail("Élément introuvable.");
  if (Number(r.updated) > 0) return done(input.id);
  return fail(`Le montant nécessaire ne peut pas être inférieur aux ${fmt(Number(r.engaged))} FCFA déjà engagés.`);
}

/**
 * Sortie de caisse vers un projet. Règle : jamais plus que le disponible en caisse ni que le reste à
 * financer. Vérifié dans une transaction, sous verrou, au moment de l'insertion.
 */
export async function addDisbursement(input: { projectId: string; amount: number; label: string }): Promise<ProjectResult> {
  const userId = await actionUserId();
  const { projectId, amount } = input;
  if (!isId(projectId)) return fail("Élément introuvable.");
  if (!isAmount(amount)) return fail("Saisissez un montant.");
  const label = clean(input.label, 120) || "Sortie de caisse";
  const [, res] = await db.batch([
    lockCaisse(userId),
    db.execute(sql`
      with p as (
        select p.id, p.target, coalesce((select sum(amount) from project_disbursements d
          where d.project_id = p.id and d.user_id = p.user_id), 0) as engaged
        from projects p where p.id = ${projectId} and p.user_id = ${userId}
      ), c as (
        select ${caisseAvailableSql(userId, await getPeriodSettings(userId))} as available
      ), ins as (
        insert into project_disbursements (user_id, project_id, amount, label)
        select ${userId}, p.id, ${amount}::bigint, ${label} from p, c
        where ${amount}::bigint <= c.available and ${amount}::bigint <= p.target - p.engaged
        returning id
      )
      select p.target - p.engaged as rest, c.available, (select count(*) from ins) as inserted from p, c`),
  ]);
  const r = rowsOf(res)[0];
  if (!r) return fail("Élément introuvable.");
  if (Number(r.inserted) > 0) return done(projectId);
  const available = Number(r.available), rest = Number(r.rest);
  if (available <= 0) return fail("La caisse est vide : aucune sortie possible.");
  if (amount > available) return fail(`Montant supérieur à la caisse disponible (${fmt(available)} FCFA).`);
  return fail(`Montant supérieur au reste à financer (${fmt(Math.max(0, rest))} FCFA). Augmentez le montant nécessaire pour continuer.`);
}

/** Supprime une sortie : le montant revient dans la caisse. */
export async function deleteDisbursement(id: string): Promise<ProjectResult> {
  const userId = await actionUserId();
  if (!isId(id)) return fail("Sortie introuvable.");
  await db.execute(sql`delete from project_disbursements where id = ${id} and user_id = ${userId}`);
  return done();
}

/** Supprime un projet et ses sorties (par cascade) : les montants reviennent dans la caisse. */
export async function deleteProject(id: string): Promise<ProjectResult> {
  const userId = await actionUserId();
  if (!isId(id)) return fail("Élément introuvable.");
  await db.execute(sql`delete from projects where id = ${id} and user_id = ${userId}`);
  return done();
}

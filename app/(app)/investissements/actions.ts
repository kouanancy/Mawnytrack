"use server";

import { sql, type SQL } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { caisseAvailableSql } from "@/lib/caisse";
import { getPeriodSettings } from "@/lib/period-server";
import { db } from "@/lib/db";
import { fmt } from "@/lib/format";
import { APP_TZ, localDayTime } from "@/lib/month";
import type { PeriodSettings } from "@/lib/period";
import { checkProjectMove, type CashState, type MoveType } from "@/lib/project-cash";
import { actionUserId } from "@/lib/session";

// Investissements et projets, financés uniquement par la caisse. Les sorties (project_disbursements)
// ne touchent ni le budget, ni les dépenses, ni le reste disponible du mois.

export type ProjectResult = { ok: true; id?: string; balance?: number } | { ok: false; error: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_AMOUNT = 1_000_000_000_000;
type Row = Record<string, unknown>;
const rowsOf = (r: unknown) => (r as { rows: Row[] }).rows;
const fail = (error: string): ProjectResult => ({ ok: false, error });
const isAmount = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) > 0 && (v as number) <= MAX_AMOUNT;
const clean = (v: unknown, max: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : "");
const isId = (v: unknown): v is string => typeof v === "string" && UUID_RE.test(v);
const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/** Verrou par utilisateur : les sorties de caisse et les changements de montant nécessaire passent un par un. */
const lockCaisse = (userId: string) =>
  db.execute(sql`select pg_advisory_xact_lock(hashtextextended(${"caisse:" + userId}, 0))`);

function done(id?: string, balance?: number): ProjectResult {
  revalidatePath("/", "layout");
  return { ok: true, id, balance };
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
      with p as (
        select kind, closed_at from projects where id = ${input.id} and user_id = ${userId}
      ), e as (
        -- Investissement : total sorti ; Projet : alloué (approvisionnements − restitutions)
        select case when (select kind from p) = 'project' then
            (select coalesce(sum(case type when 'fund' then amount when 'back' then -amount else 0 end), 0)
              from project_moves where user_id = ${userId} and project_id = ${input.id})
          else
            (select coalesce(sum(amount), 0) from project_disbursements where user_id = ${userId} and project_id = ${input.id})
          end as engaged
      ), up as (
        update projects set target = ${input.target}::bigint
        where id = ${input.id} and user_id = ${userId} and closed_at is null
          and ${input.target}::bigint >= (select engaged from e)
        returning id
      )
      select e.engaged, (select count(*) from up) as updated, (select kind from p) as kind,
        exists (select 1 from p) as found, exists (select 1 from p where closed_at is not null) as closed
      from e`),
  ]);
  const r = rowsOf(res)[0];
  if (!r?.found) return fail("Élément introuvable.");
  if (Number(r.updated) > 0) return done(input.id);
  if (r.closed) return fail("Projet clôturé : lecture seule.");
  return fail(
    `Le montant nécessaire ne peut pas être inférieur aux ${fmt(Number(r.engaged))} FCFA déjà ${r.kind === "project" ? "alloués" : "engagés"}.`,
  );
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
        from projects p where p.id = ${projectId} and p.user_id = ${userId} and p.kind = 'investment'
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

/* ---------- Caisse d'un projet (éléments de type « Projet ») ---------- */

/**
 * État d'un projet sous verrou : alloué, sorties, restitutions, solde et disponible de la caisse principale,
 * puis mv = mouvement concerné (type et ancien montant ; ancien montant 0 pour un ajout).
 */
function stateCtes(userId: string, projectId: SQL, ps: PeriodSettings) {
  return sql`
    p as (
      select id, name, kind, target, closed_at from projects where id = ${projectId} and user_id = ${userId}
    ), m as (
      select coalesce(sum(amount) filter (where type = 'fund'), 0) as fund,
        coalesce(sum(amount) filter (where type = 'out'), 0) as spent,
        coalesce(sum(amount) filter (where type = 'back'), 0) as back
      from project_moves where user_id = ${userId} and project_id = (select id from p)
    ), st as (
      select p.id, p.name, p.kind, p.target, p.closed_at is not null as closed,
        m.fund - m.back as allocated, m.spent, m.back, m.fund - m.back - m.spent as balance,
        ${caisseAvailableSql(userId, ps)} as available
      from p, m
    )`;
}

/**
 * Conditions d'un mouvement (même règle que checkProjectMove) : solde du projet et caisse principale jamais
 * négatifs, alloué jamais au-delà du montant nécessaire ; une modification qui n'aggrave rien reste possible.
 * mv.type / mv.amount : mouvement et ancien montant ; amount : nouveau montant (0 = suppression).
 */
function allowed(amount: number) {
  const a = sql`${amount}::bigint`;
  const dAlloc = sql`(case mv.type when 'fund' then ${a} - mv.amount when 'back' then mv.amount - ${a} else 0 end)`;
  const dBal = sql`(case mv.type when 'fund' then ${a} - mv.amount else mv.amount - ${a} end)`;
  return sql`st.kind = 'project' and not st.closed
    and (st.balance + ${dBal} >= 0 or ${dBal} >= 0)
    and (st.available - ${dAlloc} >= 0 or ${dAlloc} <= 0)
    and (mv.type <> 'fund' or st.allocated + ${dAlloc} <= st.target or ${dAlloc} <= 0)`;
}

type StateRow = Row & { kind: string; closed: boolean; target: unknown; allocated: unknown; balance: unknown; available: unknown };

/** Message d'un refus, avec les mêmes règles que l'interface. */
function refusal(r: StateRow, type: MoveType, old: number, amount: number): ProjectResult {
  if (r.kind !== "project") return fail("Élément introuvable.");
  const s: CashState = {
    target: Number(r.target),
    allocated: Number(r.allocated),
    balance: Number(r.balance),
    available: Number(r.available),
    closed: r.closed === true,
  };
  const c = checkProjectMove(s, type, old, amount);
  return fail(c.ok ? "Opération impossible. Réessayez." : c.hint);
}

const defaultLabel: Record<MoveType, string> = {
  fund: "Approvisionnement depuis la caisse",
  out: "Sortie",
  back: "Restitution à la caisse",
};

/** Ajoute un approvisionnement ou une sortie, sous verrou, si les règles le permettent. */
async function addMove(input: { projectId: string; amount: number; label: string }, type: "fund" | "out"): Promise<ProjectResult> {
  const userId = await actionUserId();
  const { projectId, amount } = input;
  if (!isId(projectId)) return fail("Projet introuvable.");
  if (!isAmount(amount)) return fail("Saisissez un montant.");
  const label = clean(input.label, 120) || defaultLabel[type];
  const ps = await getPeriodSettings(userId);
  const [, res] = await db.batch([
    lockCaisse(userId),
    db.execute(sql`
      with ${stateCtes(userId, sql`${projectId}::uuid`, ps)},
      mv as (select ${type}::text as type, 0::bigint as amount),
      ins as (
        insert into project_moves (user_id, project_id, type, amount, label)
        select ${userId}, st.id, ${type}, ${amount}::bigint, ${label} from st, mv
        where ${allowed(amount)}
        returning id
      )
      select st.*, (select id from ins) as new_id from st`),
  ]);
  const r = rowsOf(res)[0] as StateRow | undefined;
  if (!r) return fail("Projet introuvable.");
  const balance = Number(r.balance) + (type === "fund" ? amount : -amount);
  if (r.new_id) return done(String(r.new_id), balance);
  return refusal(r, type, 0, amount);
}

/** Approvisionne la caisse du projet depuis la caisse principale (au plus le disponible et le reste à financer). */
export async function fundProject(input: { projectId: string; amount: number; label: string }) {
  return addMove(input, "fund");
}

/** Sortie d'argent du projet (au plus le solde de sa caisse) ; renvoie l'identifiant et le nouveau solde. */
export async function addProjectOut(input: { projectId: string; amount: number; label: string }) {
  return addMove(input, "out");
}

/** Modifie un mouvement (montant, libellé, date), avec les mêmes contrôles. Nouvelle date : même heure locale. */
export async function updateProjectMove(input: { id: string; amount: number; label: string; date: string }): Promise<ProjectResult> {
  const userId = await actionUserId();
  const { id, amount, date } = input;
  if (!isId(id)) return fail("Mouvement introuvable.");
  if (!isAmount(amount)) return fail("Saisissez un montant.");
  if (typeof date !== "string" || !DATE_RE.test(date) || Number.isNaN(Date.parse(date))) return fail("Date invalide.");
  const label = clean(input.label, 120);
  const today = localDayTime(new Date(), APP_TZ).day;
  const ps = await getPeriodSettings(userId);
  const [, res] = await db.batch([
    lockCaisse(userId),
    db.execute(sql`
      with mv as (
        select id, project_id, type, amount, occurred_at,
          to_char(occurred_at at time zone ${APP_TZ}, 'YYYY-MM-DD') as old_day
        from project_moves where id = ${id} and user_id = ${userId}
      ), ${stateCtes(userId, sql`(select project_id from mv)`, ps)},
      up as (
        update project_moves pm set amount = ${amount}::bigint,
          label = coalesce(nullif(${label}, ''), case mv.type when 'fund' then ${defaultLabel.fund}
            when 'out' then ${defaultLabel.out} else ${defaultLabel.back} end),
          occurred_at = ((${date})::date + (mv.occurred_at at time zone ${APP_TZ})::time) at time zone ${APP_TZ}
        from st, mv
        where pm.id = mv.id and pm.user_id = ${userId}
          and ((${date})::date <= (${today})::date or ${date} = mv.old_day)
          and ${allowed(amount)}
        returning pm.id, pm.project_id
      )
      select st.*, mv.type as mv_type, mv.amount as mv_amount, mv.old_day, (select count(*) from up) as updated
      from st, mv`),
  ]);
  const r = rowsOf(res)[0] as StateRow | undefined;
  if (!r) return fail("Mouvement introuvable.");
  if (Number(r.updated) > 0) return done(String(r.id));
  if (date > today && date !== r.old_day) return fail("La date ne peut pas être dans le futur.");
  return refusal(r, r.mv_type as MoveType, Number(r.mv_amount), amount);
}

/** Supprime un mouvement, avec les mêmes contrôles (solde du projet et caisse principale jamais négatifs). */
export async function deleteProjectMove(id: string): Promise<ProjectResult> {
  const userId = await actionUserId();
  if (!isId(id)) return fail("Mouvement introuvable.");
  const ps = await getPeriodSettings(userId);
  const [, res] = await db.batch([
    lockCaisse(userId),
    db.execute(sql`
      with mv as (
        select id, project_id, type, amount from project_moves where id = ${id} and user_id = ${userId}
      ), ${stateCtes(userId, sql`(select project_id from mv)`, ps)},
      del as (
        delete from project_moves pm using st, mv
        where pm.id = mv.id and pm.user_id = ${userId} and ${allowed(0)}
        returning pm.id
      )
      select st.*, mv.type as mv_type, mv.amount as mv_amount, (select count(*) from del) as deleted
      from st, mv`),
  ]);
  const r = rowsOf(res)[0] as StateRow | undefined;
  if (!r) return fail("Mouvement introuvable.");
  if (Number(r.deleted) > 0) return done(String(r.id));
  return refusal(r, r.mv_type as MoveType, Number(r.mv_amount), 0);
}

/**
 * Clôture : restitue le solde du projet à la caisse principale (mouvement 'back') puis passe le projet en
 * lecture seule, dans la même transaction, sous verrou.
 */
export async function closeProject(id: string): Promise<ProjectResult> {
  const userId = await actionUserId();
  if (!isId(id)) return fail("Projet introuvable.");
  const ps = await getPeriodSettings(userId);
  const [, res] = await db.batch([
    lockCaisse(userId),
    db.execute(sql`
      with ${stateCtes(userId, sql`${id}::uuid`, ps)},
      back as (
        insert into project_moves (user_id, project_id, type, amount, label)
        select ${userId}, st.id, 'back', st.balance, ${"Restitution à la caisse (clôture)"} from st
        where st.kind = 'project' and not st.closed and st.balance > 0
        returning amount
      ), cl as (
        update projects set closed_at = now()
        where id = (select id from st where kind = 'project' and not closed) and user_id = ${userId}
        returning id
      )
      select st.*, (select count(*) from cl) as closed_now from st`),
  ]);
  const r = rowsOf(res)[0];
  if (!r || r.kind !== "project") return fail("Projet introuvable.");
  if (Number(r.closed_now) > 0) return done(id, 0);
  return fail("Projet déjà clôturé.");
}

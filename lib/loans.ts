import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { monthBounds, type Direction } from "@/lib/data";
import { APP_TZ } from "@/lib/month";

// Volet Prêts : tout est dérivé de la table transactions (aucune donnée en double).
//   personne 'lent'     : prêt = expense sur sa ligne, remboursement = refund
//   personne 'borrowed' : emprunt = borrow, remboursement = expense sur sa ligne
// Agrégats calculés en SQL, en une seule requête pour toutes les personnes.

export type Person = {
  id: string;
  name: string;
  direction: Direction;
  lineId: string | null;
  /** Total prêté (lent) ou emprunté (borrowed) */
  total: number;
  /** Total remboursé */
  back: number;
  /** Reste dû (lent) ou reste à rendre (borrowed), jamais négatif */
  due: number;
};

export type Movement = {
  id: string;
  /** loan : prêt accordé ou emprunt reçu ; pay : remboursement */
  type: "loan" | "pay";
  amount: number;
  label: string;
  day: string;
  time: string;
};

type Row = Record<string, unknown>;
type Rows = { rows: Row[] };
const n = (v: unknown) => (v == null ? 0 : Number(v));

/** Mouvement « prêt » : expense pour une personne 'lent', borrow pour une personne 'borrowed'. */
const LOAN = sql`((p.direction = 'lent' and t.kind = 'expense') or (p.direction = 'borrowed' and t.kind = 'borrow'))`;
/** Mouvement « remboursement » : refund pour 'lent', expense pour 'borrowed'. */
const PAY = sql`((p.direction = 'lent' and t.kind = 'refund') or (p.direction = 'borrowed' and t.kind = 'expense'))`;

function peopleQuery(userId: string, personId?: string) {
  return db.execute(sql`
    select p.id, p.name, p.direction, bl.id as line_id,
      coalesce(sum(t.amount) filter (where ${LOAN}), 0) as total,
      coalesce(sum(t.amount) filter (where ${PAY}), 0) as back
    from people p
    left join budget_lines bl on bl.person_id = p.id and bl.user_id = p.user_id
    left join transactions t on t.person_id = p.id and t.user_id = p.user_id
    where p.user_id = ${userId} ${personId ? sql`and p.id = ${personId}` : sql``}
    group by p.id, bl.id
    order by lower(p.name)`);
}

function toPerson(r: Row): Person {
  const total = n(r.total), back = n(r.back);
  return {
    id: String(r.id),
    name: String(r.name),
    direction: r.direction as Direction,
    lineId: (r.line_id as string) ?? null,
    total,
    back,
    due: Math.max(0, total - back),
  };
}

function toMovement(r: Row): Movement {
  return { id: String(r.id), type: r.type as Movement["type"], amount: n(r.amount), label: String(r.label ?? ""), day: String(r.day), time: String(r.time) };
}

/** Toutes les personnes de l'utilisateur, avec leurs totaux. */
export async function getPeople(userId: string): Promise<Person[]> {
  return ((await peopleQuery(userId)) as unknown as Rows).rows.map(toPerson);
}

const movementCols = sql`t.id, case when ${LOAN} then 'loan' else 'pay' end as type, t.amount, t.label,
  to_char(t.occurred_at at time zone ${APP_TZ}, 'YYYY-MM-DD') as day,
  to_char(t.occurred_at at time zone ${APP_TZ}, 'HH24:MI') as time`;

/** Fiche d'une personne : totaux et historique (du plus récent au plus ancien), en un seul lot. */
export async function getPerson(userId: string, personId: string) {
  const [people, history] = (await db.batch([
    peopleQuery(userId, personId),
    db.execute(sql`
      select ${movementCols}
      from transactions t join people p on p.id = t.person_id and p.user_id = t.user_id
      where t.user_id = ${userId} and t.person_id = ${personId} and (${LOAN} or ${PAY})
      order by t.occurred_at desc, t.created_at desc`),
  ])) as unknown as Rows[];
  const person = people.rows[0];
  return person ? { person: toPerson(person), history: history.rows.map(toMovement) } : null;
}

export type StatementRow = Movement & { /** Reste dû après ce mouvement */ balance: number };

/**
 * Relevé d'une personne. period = "YYYY-MM" (un mois) ou "tout" (du premier mouvement à aujourd'hui).
 * Le reste dû après chaque mouvement est calculé en SQL (somme cumulée sur tout l'historique).
 */
export async function getStatement(userId: string, personId: string, period: string) {
  const all = period === "tout";
  const bounds = all ? null : monthBounds(period);
  const [people, before, rows] = (await db.batch([
    peopleQuery(userId, personId),
    db.execute(sql`
      select coalesce(sum(case when ${LOAN} then t.amount when ${PAY} then -t.amount else 0 end), 0) as before
      from transactions t join people p on p.id = t.person_id and p.user_id = t.user_id
      where t.user_id = ${userId} and t.person_id = ${personId} and ${bounds ? sql`t.occurred_at < ${bounds.lo}` : sql`false`}`),
    db.execute(sql`
      select * from (
        select ${movementCols}, t.occurred_at, t.created_at,
          sum(case when ${LOAN} then t.amount else -t.amount end) over (order by t.occurred_at, t.created_at, t.id) as balance
        from transactions t join people p on p.id = t.person_id and p.user_id = t.user_id
        where t.user_id = ${userId} and t.person_id = ${personId} and (${LOAN} or ${PAY})
      ) x
      ${bounds ? sql`where x.occurred_at >= ${bounds.lo} and x.occurred_at < ${bounds.hi}` : sql``}
      order by x.occurred_at, x.created_at, x.id`),
  ])) as unknown as Rows[];
  const person = people.rows[0];
  if (!person) return null;
  return {
    person: toPerson(person),
    before: Math.max(0, n(before.rows[0]?.before)),
    rows: rows.rows.map((r): StatementRow => ({ ...toMovement(r), balance: Math.max(0, n(r.balance)) })),
  };
}

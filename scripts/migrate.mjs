// Applique les migrations SQL de db/migrations/ (ordre des noms de fichiers) sur DATABASE_URL.
// Lancé automatiquement avant `next build` (script "build"). Chaque fichier non encore appliqué
// s'exécute dans sa propre transaction puis est enregistré dans la table _migrations.
// Un échec arrête le script avec un code de sortie non nul, ce qui interrompt le déploiement.
// Usage : node scripts/migrate.mjs
import { readdir, readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import pg from "pg";

const DIR = new URL("../db/migrations/", import.meta.url);
// Verrou consultatif de transaction : un seul déploiement migre à la fois. Libéré à chaque COMMIT/ROLLBACK,
// il reste sûr derrière un pooler en mode transaction.
const LOCK_ID = 727_401;

/**
 * Découpe un script SQL en instructions, en ignorant les « ; » situés dans les commentaires
 * (-- … et /* … *\/ imbriqués), les chaînes ('…', E'…'), les identifiants entre guillemets
 * et les blocs à dollars ($$ … $$, $corps$ … $corps$) des fonctions et blocs DO.
 */
export function splitStatements(sql) {
  const out = [];
  let cur = "";
  let hasCode = false; // l'instruction en cours contient autre chose que des commentaires
  let i = 0;
  const n = sql.length;
  const push = () => {
    if (hasCode) out.push(cur.trim());
    cur = "";
    hasCode = false;
  };

  while (i < n) {
    const c = sql[i];
    const next = sql[i + 1];

    if (c === "-" && next === "-") {
      const end = sql.indexOf("\n", i);
      const stop = end === -1 ? n : end + 1;
      cur += sql.slice(i, stop);
      i = stop;
      continue;
    }
    if (c === "/" && next === "*") {
      let depth = 0;
      let j = i;
      while (j < n) {
        if (sql[j] === "/" && sql[j + 1] === "*") (depth++, (j += 2));
        else if (sql[j] === "*" && sql[j + 1] === "/") {
          depth--;
          j += 2;
          if (depth === 0) break;
        } else j++;
      }
      if (depth !== 0) throw new Error("Commentaire /* … */ non fermé.");
      cur += sql.slice(i, j);
      i = j;
      continue;
    }
    if (c === "'") {
      // E'…' accepte les échappements par antislash
      const escapes = /[eE]/.test(sql[i - 1] ?? "") && !/[\w$]/.test(sql[i - 2] ?? "");
      let j = i + 1;
      for (;;) {
        if (j >= n) throw new Error("Chaîne '…' non fermée.");
        if (escapes && sql[j] === "\\") j += 2;
        else if (sql[j] === "'" && sql[j + 1] === "'") j += 2;
        else if (sql[j] === "'") break;
        else j++;
      }
      cur += sql.slice(i, j + 1);
      hasCode = true;
      i = j + 1;
      continue;
    }
    if (c === '"') {
      let j = i + 1;
      for (;;) {
        if (j >= n) throw new Error('Identifiant "…" non fermé.');
        if (sql[j] === '"' && sql[j + 1] === '"') j += 2;
        else if (sql[j] === '"') break;
        else j++;
      }
      cur += sql.slice(i, j + 1);
      hasCode = true;
      i = j + 1;
      continue;
    }
    if (c === "$" && !/[\w$]/.test(sql[i - 1] ?? "")) {
      const m = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i));
      if (m) {
        const tag = m[0];
        const end = sql.indexOf(tag, i + tag.length);
        if (end === -1) throw new Error(`Bloc ${tag} … ${tag} non fermé.`);
        cur += sql.slice(i, end + tag.length);
        hasCode = true;
        i = end + tag.length;
        continue;
      }
    }
    if (c === ";") {
      push();
      i++;
      continue;
    }
    if (!/\s/.test(c)) hasCode = true;
    cur += c;
    i++;
  }
  push();
  return out;
}

function connectionString() {
  // Connexion directe de préférence (intégration Neon de Vercel) ; sinon DATABASE_URL.
  const raw = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!raw) return null;
  // Neon fournit sslmode=require : on demande explicitement la vérification complète du certificat
  // (comportement actuel de pg pour « require »), sans l'avertissement de dépréciation.
  try {
    const url = new URL(raw);
    if (["prefer", "require", "verify-ca"].includes(url.searchParams.get("sslmode") ?? "")) {
      url.searchParams.set("sslmode", "verify-full");
    }
    return url.toString();
  } catch {
    return raw;
  }
}

async function main() {
  const conn = connectionString();
  if (!conn) {
    if (process.env.VERCEL) throw new Error("DATABASE_URL n'est pas définie : impossible d'appliquer les migrations.");
    console.log("[migrations] DATABASE_URL absente : migrations ignorées (compilation locale).");
    return;
  }

  const files = (await readdir(DIR)).filter((f) => /^\d+_.+\.sql$/.test(f)).sort();
  const client = new pg.Client({ connectionString: conn, application_name: "mawnytrack-migrate" });
  await client.connect();
  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock($1)", [LOCK_ID]);
    await client.query(`create table if not exists _migrations (
      name text primary key,
      applied_at timestamptz not null default now()
    )`);
    await client.query("commit");
    const done = new Set((await client.query("select name from _migrations")).rows.map((r) => r.name));
    const pending = files.filter((f) => !done.has(f));
    if (!pending.length) {
      console.log(`[migrations] Base à jour (${files.length} fichier(s) déjà appliqué(s)).`);
      return;
    }

    let applied = 0;
    for (const file of pending) {
      const statements = splitStatements(await readFile(new URL(file, DIR), "utf8"));
      await client.query("begin");
      let k = -1;
      try {
        await client.query("select pg_advisory_xact_lock($1)", [LOCK_ID]);
        // Un autre déploiement a pu l'appliquer entre-temps
        const { rowCount } = await client.query("select 1 from _migrations where name = $1", [file]);
        if (rowCount) {
          await client.query("commit");
          continue;
        }
        process.stdout.write(`[migrations] ${file} (${statements.length} instructions)… `);
        for (k = 0; k < statements.length; k++) await client.query(statements[k]);
        await client.query("insert into _migrations (name) values ($1)", [file]);
        await client.query("commit");
        applied++;
        console.log("appliquée.");
      } catch (err) {
        await client.query("rollback").catch(() => {});
        console.log("ÉCHEC.");
        const where = k >= 0 && k < statements.length ? ` à l'instruction ${k + 1}/${statements.length}` : "";
        const excerpt = k >= 0 ? (statements[k] ?? "").split("\n").slice(0, 6).join("\n") : "";
        throw new Error(
          `La migration ${file} a échoué${where} ; elle a été annulée, la base n'est pas modifiée par ce fichier.\n` +
            `Erreur PostgreSQL : ${err.message}${err.code ? ` (code ${err.code})` : ""}` +
            (excerpt ? `\nInstruction :\n${excerpt}` : ""),
        );
      }
    }
    console.log(`[migrations] ${applied} migration(s) appliquée(s).`);
  } finally {
    await client.end().catch(() => {});
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(`\n[migrations] ÉCHEC — déploiement interrompu.\n${err.message}\n`);
    process.exit(1);
  });
}

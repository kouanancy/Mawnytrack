# Mawnytrack — consignes du projet

Application personnelle de suivi des finances (FCFA). Le prototype validé `docs/prototype-mawnytrack.html`
fait référence pour le design, les textes et le comportement : le reproduire fidèlement.

## Design et textes
- Palette Forêt uniquement. Toutes les couleurs sont des variables CSS définies dans `:root` de `app/globals.css`
  (valeurs claires), redéfinies dans `@media (prefers-color-scheme: dark)` avec `color-scheme: dark` : l'application
  suit automatiquement le réglage clair/sombre de l'appareil, comme le prototype (pas de bouton de thème).
- Aucune couleur écrite en dur ailleurs (composants, styles en ligne, règles CSS) : toujours `var(--…)`.
  Pour un nouveau ton, ajouter une variable dans les deux blocs.
- Impression : toujours sur fond blanc (bloc `@media print` qui réimpose les valeurs claires).
- Vérifier chaque écran en clair et en sombre avant de livrer.
- Polices Bricolage Grotesque (titres) et Figtree (texte) via `next/font`.
- Mise en page mobile d'abord : colonne de 480 px maximum.
- Textes en français, impersonnels, avec vouvoiement (« Saisissez un montant », jamais de tutoiement ni de « je »).
- Logo : `public/mawnytrack-icon.svg`. Icônes PNG et `app/favicon.ico` générés par `npm run icons`.
- En-tête : menu à trois traits (Dépenses, Revenus, Budget, Prêts, Caisse, Investissements), logo
  « Mawny » couleur texte + « track » en vert, sélecteur de mois (`?m=YYYY-MM`), titre de section en orange rosé.
  Les volets non développés affichent « Bientôt disponible » (`lib/sections.ts`, champ `ready`).

## Stack
- Next.js (App Router, TypeScript), déployé sur Vercel. `proxy.ts` (ex-middleware) ne fait qu'une redirection
  rapide si le cookie de session manque ; la vraie vérification est faite côté serveur (`lib/session.ts`).
- PostgreSQL Neon, driver HTTP `@neondatabase/serverless` + Drizzle ORM (`lib/db`). Variable `DATABASE_URL`.
- Better Auth, e-mail + mot de passe uniquement (`lib/auth.ts`). Variable `BETTER_AUTH_SECRET`.
  `BETTER_AUTH_URL` est facultative (à définir pour un domaine personnalisé ; sinon hôtes `*.vercel.app`).
- `APP_TIMEZONE` (facultatif, défaut `Africa/Abidjan`) : fuseau des bornes de mois et de journée.

## Migrations SQL
- Un fichier complet par étape dans `db/migrations/NNN_nom.sql`, copiable tel quel dans l'éditeur SQL de Neon.
- **Ne jamais modifier un fichier de migration déjà livré** : créer le fichier suivant (003_…, 004_…).
- `lib/db/schema.ts` est le miroir Drizzle des migrations ; le mettre à jour à chaque nouvelle migration.
- Terminer chaque livraison par la liste des fichiers SQL à exécuter dans Neon, dans l'ordre.

## Règles métier
- Montants en FCFA, entiers (`bigint`), affichés avec séparateur d'espace (`fmt` dans `lib/format.ts`).
- `transactions` est la source unique de vérité :
  - `income` : revenu ;
  - `expense` : dépense ; sur une ligne de personne `lent` = nouveau prêt accordé ; sur une ligne de personne
    `borrowed` = remboursement d'un emprunt ;
  - `refund` : remboursement reçu d'une personne `lent` ;
  - `borrow` : argent emprunté reçu d'une personne `borrowed`.
- Reste disponible du mois = revenus + emprunts reçus − dépenses nettes (`expense` − `refund`).
- Dettes en cours = somme, par personne `borrowed`, de max(0, emprunts − remboursements) (calculée, affichée à l'étape 2).
- Budget d'un mois = `monthly_budgets.planned` s'il existe, sinon `budget_lines.planned`. À la première consultation
  d'un mois terminé, les valeurs sont figées dans `monthly_budgets` (`freezeMonth` dans `lib/data.ts`).
  Modifier le budget d'un mois terminé change sa valeur figée ; pour le mois en cours ou à venir, la valeur par défaut.
- Épargne supplémentaire = revenus − budget prévu ; avertissement si le budget prévu dépasse les revenus.

### Règle essentielle : aucun dépassement de budget
- Une ligne avec un budget prévu > 0 ne peut jamais avoir un dépensé du mois supérieur à ce budget.
- Une ligne à 0 n'a pas de plafond.
- Interface : dès la sélection d'une ligne épuisée, afficher « Budget déjà atteint pour « X ». Aucune nouvelle
  dépense possible sans modifier le budget prévu. » et désactiver le bouton ; pendant la saisie, si le montant
  dépasse le reste, afficher le reste disponible et désactiver le bouton (`checkExpense` dans `lib/ledger.ts`).
- Serveur : vérification dans une transaction SQL qui verrouille la ligne (`FOR UPDATE`) puis n'insère que si le
  plafond le permet (`addExpense` dans `app/(app)/actions.ts`). Ne jamais contourner ce chemin pour insérer une dépense.
- Un budget prévu ne peut pas être baissé sous le montant déjà dépensé du mois (`setPlanned`, même verrou).
- Un remboursement d'emprunt ne peut pas dépasser le reste à rendre.

## Sécurité
- Toute requête est filtrée par l'utilisateur connecté côté serveur (`user_id`), y compris les suppressions.
  Les identifiants viennent de la session (`requireUserId` / `actionUserId`), jamais du client.
- Les clés étrangères composites `(id, user_id)` empêchent en base toute référence croisée entre utilisateurs.

## Performances (mode de travail)
- Server Components pour la lecture, Server Actions pour l'écriture, puis `revalidatePath`.
- Lectures d'un écran en un seul lot `db.batch` (un aller-retour HTTP) ; agrégats calculés en SQL, jamais une
  requête par ligne.
- Mises à jour optimistes (`useOptimistic` + réducteur `reduce` de `lib/ledger.ts`) pour un affichage instantané.
- Session lue depuis le cookie signé (`cookieCache`) pour éviter une requête SQL par page.

## Vérifications avant commit
- `npm run typecheck` et `npm run build`.

## Livraison
- À chaque livraison : pousser la branche de travail, ouvrir une pull request vers `main`, puis la fusionner.
- Après une fusion, repartir de `main` à jour pour la suite du travail.

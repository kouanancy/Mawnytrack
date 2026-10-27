# Mawnytrack — consignes du projet

Application personnelle de suivi des finances (FCFA). Le prototype validé `docs/prototype-mawnytrack.html`
fait référence pour le design, les textes et le comportement : le reproduire fidèlement.

## Design et textes
- Palette Forêt uniquement. Toutes les couleurs sont des variables CSS définies dans `:root` de `app/globals.css`
  (valeurs claires), redéfinies avec `color-scheme: dark` dans `@media (prefers-color-scheme: dark)` (sélecteur
  `:root:not([data-theme="light"])`) et dans `:root[data-theme="dark"]`.
- Thème : « Automatique » (défaut, suit l'appareil comme le prototype), « Clair » ou « Sombre », choisi dans les
  Réglages. Enregistré dans `user_settings.theme` et recopié dans le cookie `mt-theme` (connexion, changement,
  réinitialisation) ; `app/layout.tsx` lit ce cookie et pose `data-theme` sur `<html>` côté serveur : aucun flash.
- Aucune couleur écrite en dur ailleurs (composants, styles en ligne, règles CSS) : toujours `var(--…)`.
  Pour un nouveau ton, ajouter une variable dans les deux blocs.
- Impression : toujours sur fond blanc (bloc `@media print` qui réimpose les valeurs claires).
- Vérifier chaque écran en clair et en sombre avant de livrer.
- Polices Bricolage Grotesque (titres) et Figtree (texte) via `next/font`.
- Mise en page mobile d'abord. Règles multi-écran (bloc « Multi-écran » de `app/globals.css`) :
  - téléphone (< 768 px) : colonne de 480 px, identique au prototype ;
  - tablette portrait (768 – 1023 px) : menu à trois traits, colonne de 720 px, synthèse du budget en 4 tuiles,
    lignes de budget sur 2 colonnes ;
  - tablette paysage et ordinateur (≥ 1024 px) : barre latérale fixe à gauche (`components/Sidebar.tsx` : logo,
    sections, Réglages et Se déconnecter en bas), plus d'icône à trois traits, contenu centré jusqu'à 1200 px,
    titre de section et sélecteur de mois sur une ligne ; pages en deux colonnes `.cols` (à gauche la carte et
    la saisie, collantes ; à droite le journal), lignes de budget sur 3 colonnes, Réglages sur 2 colonnes.
  - Vérifier chaque page à 375, 768, 1024 et 1440 px, en clair et en sombre, sans défilement horizontal.
- Textes en français, impersonnels, avec vouvoiement (« Saisissez un montant », jamais de tutoiement ni de « je »).
- Logo : `public/mawnytrack-icon.svg`. Icônes PNG et `app/favicon.ico` générés par `npm run icons`.
- En-tête : menu à trois traits (Dépenses, Revenus, Budget, Prêts, Caisse, Investissements), logo
  « Mawny » couleur texte + « track » en vert, sélecteur de mois (`?m=YYYY-MM`), titre de section en orange rosé.
  Les volets non développés affichent « Bientôt disponible » (`lib/sections.ts`, champ `ready`). Réglages et
  Se déconnecter figurent en bas du menu et de la barre latérale.
- Champs mot de passe : toujours `components/PasswordInput.tsx` (bouton « œil » accessible, type="button").
- Première utilisation (aucune ligne de budget) : Dépenses affiche l'écran de bienvenue expliquant comment créer
  la première ligne de budget et le premier revenu.

## Stack
- Next.js (App Router, TypeScript), déployé sur Vercel. `proxy.ts` (ex-middleware) ne fait qu'une redirection
  rapide si le cookie de session manque ; la vraie vérification est faite côté serveur (`lib/session.ts`).
- PostgreSQL Neon, driver HTTP `@neondatabase/serverless` + Drizzle ORM (`lib/db`). Variable `DATABASE_URL`.
- Better Auth, e-mail + mot de passe uniquement (`lib/auth.ts`). Variable `BETTER_AUTH_SECRET`.
  `BETTER_AUTH_URL` est facultative (à définir pour un domaine personnalisé ; sinon hôtes `*.vercel.app`).
  Cache de session dans un cookie signé d'une minute : une déconnexion à distance prend effet en moins d'une minute.
- Mot de passe oublié : flux Better Auth (`requestPasswordReset` → `/api/auth/reset-password/:token` →
  `/nouveau-mot-de-passe?token=…`), lien valable 1 heure, à usage unique, sessions fermées après usage. Message
  identique que l'adresse existe ou non. E-mail envoyé en tâche de fond via Resend (`lib/email.ts`, API HTTP,
  variable `RESEND_API_KEY`, expéditeur `onboarding@resend.dev` ou `RESEND_FROM`). Les e-mails ne lisent pas les
  variables CSS : seule exception à la règle des couleurs, la palette claire y est écrite en ligne.
- `APP_TIMEZONE` (facultatif, défaut `Africa/Abidjan`) : fuseau des bornes de mois et de journée.

## Migrations SQL
- Un fichier complet par étape dans `db/migrations/NNN_nom.sql` (003_…, 004_…), appliqué dans l'ordre des noms.
- Application automatique : `scripts/migrate.mjs` s'exécute avant `next build` (script `build`, donc à chaque
  déploiement Vercel). Il applique chaque fichier absent de la table `_migrations`, dans sa propre transaction,
  puis l'y enregistre. Un échec annule le fichier et arrête le déploiement. Lancement manuel : `npm run migrate`.
  Connexion : `DATABASE_URL_UNPOOLED` si présente, sinon `DATABASE_URL`.
- Le script découpe les fichiers en instructions (commentaires, chaînes et blocs `$$ … $$` gérés). Pas d'instruction
  interdite en transaction (`CREATE INDEX CONCURRENTLY`, `VACUUM`, etc.) dans un fichier de migration.
- **Ne jamais modifier ni renommer un fichier de migration déjà livré** (il ne serait pas réappliqué) :
  créer le fichier suivant.
- `lib/db/schema.ts` est le miroir Drizzle des migrations ; le mettre à jour à chaque nouvelle migration.
- Terminer chaque livraison en indiquant les nouveaux fichiers de migration (appliqués au prochain déploiement).

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

## Réglages (`/reglages`, `components/SettingsView.tsx`, `app/settings-actions.ts`)
- Profil : nom (`updateUser`) et adresse e-mail (`changeEmail`, modifiée immédiatement, adresse déjà prise refusée).
- Sécurité : changer le mot de passe (actuel, nouveau, confirmation ; les autres appareils sont déconnectés),
  « Se déconnecter », « Se déconnecter de tous les appareils » (`revokeSessions`, retour à la connexion).
- Apparence : thème Automatique / Clair / Sombre (voir Design).
- Données : « Exporter mes données » (`/reglages/export`, JSON unique de toutes les tables de l'utilisateur, sans
  mot de passe ni jeton) ; « Tout réinitialiser » = remise à zéro comme pour une première utilisation : suppression
  dans une seule transaction des transactions, lignes, budgets figés, personnes, projets, sorties de caisse et
  réglages ; seuls l'e-mail et le mot de passe restent ; autres appareils déconnectés ; retour à Dépenses.
- Compte : « Supprimer mon compte » efface l'utilisateur et, par cascade, toutes ses données et sessions.
- Réinitialisation et suppression : double confirmation dans la page (mot « RÉINITIALISER » + mot de passe),
  revérifiée côté serveur (`verifyPassword`), limitée à l'utilisateur de la session.
- Les cookies `__Secure-…` ne s'effacent qu'avec l'attribut `Secure` (`clearAuthCookies`).
- À propos : nom de l'application et version (`package.json`, à incrémenter à chaque livraison notable).
- Chaque action affiche un message de confirmation (sous le formulaire et en message bref).

## Performances (mode de travail)
- Server Components pour la lecture, Server Actions pour l'écriture, puis `revalidatePath`.
- Lectures d'un écran en un seul lot `db.batch` (un aller-retour HTTP) ; agrégats calculés en SQL, jamais une
  requête par ligne.
- Mises à jour optimistes (`useOptimistic` + réducteur `reduce` de `lib/ledger.ts`) pour un affichage instantané.
- Session lue depuis le cookie signé (`cookieCache`, 1 min) pour éviter une requête SQL par page.

## Vérifications avant commit
- `npm run typecheck` et `npm run build`.

## Livraison
- À chaque livraison : pousser la branche de travail, ouvrir une pull request vers `main`, puis la fusionner.
- Après une fusion, repartir de `main` à jour pour la suite du travail.

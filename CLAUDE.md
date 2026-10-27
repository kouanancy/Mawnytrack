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
  - téléphone (< 768 px) : colonne de 480 px, identique au prototype ; dans l'en-tête, logo et nom centrés sur toute
    la largeur de l'écran, menu à trois traits positionné à gauche sans décaler le logo, sélecteur de mois dessous ;
  - tablette portrait (768 – 1023 px) : menu à trois traits, colonne de 720 px, synthèse du budget en 4 tuiles,
    lignes de budget sur 2 colonnes ;
  - tablette paysage et ordinateur (≥ 1024 px) : barre latérale fixe à gauche (`components/Sidebar.tsx` : logo,
    sections, Réglages et Se déconnecter en bas), plus d'icône à trois traits, contenu centré jusqu'à 1200 px,
    titre de section et sélecteur de mois sur une ligne ; pages en deux colonnes `.cols` (à gauche la carte et
    la saisie, collantes ; à droite le journal), lignes de budget sur 3 colonnes, Réglages sur 2 colonnes.
  - Vérifier chaque page à 375, 768, 1024 et 1440 px, en clair et en sombre, sans défilement horizontal.
- Textes en français, impersonnels, avec vouvoiement (« Saisissez un montant », jamais de tutoiement ni de « je »).
- Logo : `public/mawnytrack-icon.svg`. Icônes PNG et `app/favicon.ico` générés par `npm run icons`.
- En-tête : menu à trois traits (Dépenses, Revenus, Budget, Prêts, Caisse, Investissements, Rapports), logo
  « Mawny » couleur texte + « track » en vert, sélecteur de mois (`?m=YYYY-MM`), titre de section en orange rosé.
  Les volets non développés affichent « Bientôt disponible » (`lib/sections.ts`, champ `ready`). Réglages et
  Se déconnecter figurent en bas du menu et de la barre latérale. Sélecteur de mois uniquement sur Dépenses,
  Revenus et Budget (champ `month`) ; jamais sur Prêts, Caisse, Investissements, les fiches ni les relevés.
- Champs date, heure et nombre : règle globale (`width:100%`, `min-width:0`, `appearance:none`, hauteur 44 px)
  pour éviter la largeur minimale imposée par Safari iOS ; conteneurs en ligne avec `min-width:0`. Champs date :
  valeur centrée verticalement et alignée à gauche (`display:flex`, `::-webkit-date-and-time-value` avec
  `text-align:left`, `margin:0`, `line-height` = hauteur utile), même police et marge que les autres champs.
- Budget : pas de barre de progression sur les lignes (budget, prêts, remboursements d'emprunts) ; le message sous
  la ligne suffit. Les jauges restent sur la carte « Reste disponible », la Caisse et les Investissements.
- Impression : `@page` A4 portrait, marges de 15 mm ; tableaux en largeur 100 %, montants et dates sans retour
  à la ligne, libellés longs à la ligne, lignes jamais coupées, en-tête de tableau répété. À l'écran, le relevé
  défile dans son propre cadre sur téléphone.
- Boutons d'impression (relevé des prêts, dépenses filtrées) : ouvrent d'abord l'aperçu plein écran
  `components/PdfPreview.tsx`. Le PDF (`lib/pdf.ts`, routes `/depenses/pdf?m=&ligne=` et
  `/prets/[id]/releve/pdf?m=YYYY-MM|tout`) est rendu page par page avec pdf.js (`pdfjs-dist`, version legacy,
  chargé seulement à l'ouverture) : pages A4 défilables, zoom −/+ et pincement. Boutons en bas :
  - « Partager » : `navigator.share` avec le PDF en pièce jointe (WhatsApp, e-mail, Fichiers…), appelé directement
    dans le clic ; sans partage (ordinateur), téléchargement avec un message ;
  - « Imprimer » : `window.print()` n'imprime que les pages de l'aperçu (page CSS nommée `pv`, marges déjà dans le
    PDF) ; dans l'application installée (PWA « standalone ») ou sans impression, passe par le menu de partage ;
  - « Télécharger le PDF » et « Fermer » (ou Échap).
  « Préparation du document… » pendant le rendu, message et « Réessayer » en cas d'échec.
  Noms de fichiers sans accents : `Releve-Awa-octobre-2026.pdf`, `Releve-Awa-tout.pdf`, `Sorties-octobre-2026-Repas.pdf`.
  Comme les e-mails, les PDF ne lisent pas les variables CSS : la palette claire y est écrite en ligne.
- Relevé des prêts : bouton « Imprimer » (une ligne, même hauteur que la liste « Période du relevé ») qui ouvre
  l'aperçu. Sur téléphone, le tableau tient dans la largeur (police réduite, en-tête « Remb. »), montants des
  lignes de total alignés à droite sous leur colonne ; « Reste dû au … » dans la colonne Reste dû.
- Relevé des prêts (`lib/statement.ts`, commun à la page et au PDF) : période « Tout le relevé » (en premier) ou
  l'un des 12 derniers mois. Colonnes Date · Libellé · Prêt (ou Emprunt) · Remboursement · Reste dû (solde après
  chaque mouvement, somme cumulée calculée en SQL). Mois : « Reste dû au début du mois », total du mois, reste dû
  au dernier jour. Tout le relevé : titre et sous-total par mois, total général, « Reste dû au [aujourd'hui] »,
  période « du [premier mouvement] au [aujourd'hui] ».
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
- Pages d'authentification (`app/(auth)`) : bloc centré horizontalement et verticalement, sans barre latérale ni
  marge réservée ; champs en `--surface-2` / `--line` (y compris remplissage automatique du navigateur).
  Connexion, inscription et mot de passe oublié renvoient vers Dépenses si une session valide existe
  (`redirectIfSignedIn`, vérifiée en base) ; la page de nouveau mot de passe reste accessible connecté.
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
- Dettes en cours = somme, par personne `borrowed`, de max(0, emprunts − remboursements), affichée sur la carte
  « Reste disponible » tant qu'une somme reste à rendre (lien vers Prêts › Argent emprunté).
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

## Prêts (`/prets`, `lib/loans.ts`, `app/(app)/prets/actions.ts`)
- Principe : tout passe par `transactions`, aucune donnée en double. Supprimer une transaction (journaux Dépenses
  et Revenus) retire automatiquement le prêt, l'emprunt ou le remboursement correspondant.
- Une personne n'existe qu'une fois par sens (index unique `004_loans.sql`). Chaque personne a une ligne de budget
  à son nom (`budget_lines.person_id`), créée avec elle ; ces lignes ne se retirent pas depuis le Budget.
- Argent prêté (`lent`) :
  - « Ajouter une personne » : nom seul ; ligne créée dans le groupe « Prêts accordés » (Dépenses et Budget) ;
  - une dépense sur sa ligne = un nouveau prêt (libellé et montant saisis côté Dépenses) ;
  - « Enregistrer un remboursement » (montant, date) dans la fiche = `refund` sur sa ligne, limité au reste dû
    (personne verrouillée `FOR UPDATE`) ;
  - « Accordé » de la ligne = toutes ses dépenses − tous ses remboursements, sur toute la durée (jamais négatif),
    avec « Dépenses liées : X · Remboursements : Y » ; le budget prévu ne peut jamais être dépassé par l'accordé
    (`addExpense` et `setPlanned` comptent l'accordé total pour ces lignes).
- Argent emprunté (`borrowed`) :
  - « Nouvel emprunt » (prêteur, montant, date) ou « Enregistrer un nouvel emprunt » (montant, libellé) dans la
    fiche = `borrow` ; la personne et sa ligne « Remboursements d'emprunts » sont créées au besoin ;
  - l'emprunt s'ajoute aux revenus du mois et au reste disponible (« dont X empruntés »), jamais à l'épargne
    supplémentaire (revenus `income` seuls) ni à la caisse ;
  - une dépense sur sa ligne = un remboursement : bloquée si rien n'est dû, si le montant dépasse le reste à
    rendre ou le budget du mois de la ligne (interface et serveur) ; « Remboursé ce mois » non modifiable ;
  - pas de formulaire de remboursement dans la fiche : les remboursements se saisissent côté Dépenses.
- Écrans : liste (tuiles « À recevoir » / « À rembourser », bascule `?sens=emprunte`, une ligne par personne,
  statut « En cours » ou « Soldé », sans échéance) ; fiche `/prets/[id]` (retour, icône d'impression, totaux,
  formulaire selon le sens, historique du plus récent au plus ancien) ; relevé `/prets/[id]/releve?m=YYYY-MM`
  (« Tout le relevé » ou l'un des 12 derniers mois, colonne « Reste dû » ; voir Impression).
- Agrégats en SQL, une requête pour toutes les personnes ; mises à jour optimistes dans la liste et la fiche.

## Caisse (`/caisse`, `lib/caisse.ts`)
- Épargne supplémentaire d'un mois = revenus `income` du mois (jamais les emprunts) − budget prévu total du mois
  (valeurs figées de `monthly_budgets` pour les mois terminés, figées à la consultation), minimum 0.
- Disponible en caisse = somme des épargnes, du premier mois ayant un revenu au mois en cours, − toutes les
  sorties vers les investissements (`project_disbursements`). Historique calculé en une seule requête SQL
  (`savingsCtes`) ; `caisseAvailableSql` sert aussi au contrôle des sorties.
- Écran : carte « Disponible en caisse » (total épargné, total investi, lien vers Investissements), graphique
  « Évolution » (caisse cumulée en courbe pleine avec dégradé, épargne du mois en pointillés `--out`), « Détail par
  mois » du plus récent au plus ancien.

## Investissements (`/investissements`, `app/(app)/investissements/actions.ts`)
- Financés uniquement par la caisse ; les sorties ne touchent ni le budget, ni les dépenses, ni le reste disponible.
- Création : nom, type (`investment` | `project`), montant nécessaire. Liste : carte caisse (déjà investi, reste à
  financer, % des besoins couverts), filtre Tout / Investissements / Projets, statut « En préparation », « En cours »
  ou « Financé », éléments financés en bas.
- Fiche : montant nécessaire modifiable (jamais sous l'engagé), engagé non modifiable, « Sortir de la caisse »,
  historique des sorties avec suppression confirmée (le montant revient en caisse), suppression du projet.
- Règle : une sortie ne dépasse jamais le disponible en caisse ni le reste à financer. Message pendant la saisie,
  bouton désactivé, et contrôle serveur dans une transaction sous verrou consultatif par utilisateur
  (`pg_advisory_xact_lock`), qui sérialise aussi les changements de montant nécessaire.

## Rapports (`/rapports`, `lib/report.ts`, `lib/report-model.ts`, `app/api/cron/weekly-report`)
- Semaine du lundi au dimanche, fuseau `APP_TIMEZONE` (Africa/Abidjan). Rapport calculé par `computeReport`
  (lectures groupées en parallèle, agrégats en SQL) puis figé dans `weekly_reports.data` (jsonb, une ligne par
  utilisateur et par semaine, migration `005_weekly_reports.sql`).
- Contenu : synthèse (semaine : revenus, emprunts reçus, dépenses ; depuis le 1er du mois : revenus, dépenses,
  reste disponible ; dettes en cours, caisse), Budget (Ligne · Cette semaine · Ce mois · Budget prévu · Reste,
  lignes épuisées en rouge), dépenses de la semaine par jour avec total, prêts accordés (mouvements, reste dû par
  personne), emprunts (mouvements, reste à rendre par prêteur), caisse (disponible, sorties de la semaine) et
  projets en cours. `reportSections` produit les mêmes sections pour la page et pour le PDF (`documentPdf`,
  plusieurs tableaux, mêmes règles d'impression que les relevés) ; sur téléphone, intitulés courts (`short`).
- Envoi : Vercel Cron (`vercel.json`, `0 20 * * 0` = dimanche 20 h à Abidjan, UTC+0) appelle
  `/api/cron/weekly-report` avec `Authorization: Bearer CRON_SECRET` (401 sinon). Pour chaque utilisateur dont
  `user_settings.weekly_email` est vrai (défaut) : rapport de la semaine écoulée, rien d'enregistré ni d'envoyé si
  la semaine n'a aucun mouvement, jamais deux envois pour la même semaine (`sent_at`). E-mail Resend
  (`reportEmail`) : objet « Mawnytrack · Rapport du [date] au [date] », synthèse, lien « Ouvrir le rapport dans
  Mawnytrack », PDF joint `Rapport-Mawnytrack-AAAA-MM-JJ.pdf` (date du dimanche).
- Application : liste du plus récent au plus ancien, « Générer le rapport de cette semaine » (à tout moment),
  page du rapport avec « Imprimer » qui ouvre l'aperçu (Partager, Imprimer, Télécharger le PDF, Fermer).
- Réglages › Notifications : interrupteur « Recevoir le rapport hebdomadaire par e-mail » et « M'envoyer un
  rapport d'essai maintenant » (rapport de la semaine en cours, envoyé même sans mouvement).
- Variable `CRON_SECRET` obligatoire sur Vercel pour la tâche planifiée.

## Sécurité
- Toute requête est filtrée par l'utilisateur connecté côté serveur (`user_id`), y compris les suppressions.
  Les identifiants viennent de la session (`requireUserId` / `actionUserId`), jamais du client.
- Les clés étrangères composites `(id, user_id)` empêchent en base toute référence croisée entre utilisateurs.

## Réglages (`/reglages`, `components/SettingsView.tsx`, `app/settings-actions.ts`)
- Profil : nom (`updateUser`) et adresse e-mail (`changeEmail`, modifiée immédiatement, adresse déjà prise refusée).
- Sécurité : aucun champ de mot de passe. « Recevoir un lien de changement de mot de passe » envoie l'e-mail
  du flux « Mot de passe oublié ? » à l'adresse du compte (`sendPasswordLink`) : le mot de passe ne se modifie que
  par ce lien. « Se déconnecter » et « Se déconnecter de tous les appareils » (`revokeSessions`).
- Apparence : thème Automatique / Clair / Sombre (voir Design).
- Notifications : rapport hebdomadaire par e-mail (voir Rapports).
- Données : « Exporter mes données » (`/reglages/export`, JSON unique de toutes les tables de l'utilisateur, sans
  mot de passe ni jeton) ; « Tout réinitialiser » = remise à zéro comme pour une première utilisation : suppression
  dans une seule transaction des transactions (donc prêts, emprunts et remboursements), lignes, budgets figés,
  personnes, projets, sorties de caisse, rapports hebdomadaires et réglages ; seuls l'e-mail et le mot de passe restent ; autres appareils déconnectés ; retour à Dépenses.
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

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
  `/prets/[id]/releve/pdf?m=YYYY-MM|tout`) est rendu page par page avec pdf.js (`pdfjs-dist` 6, version legacy,
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
- Budget › recherche : champ « Rechercher une ligne… » (loupe, croix pour effacer, Échap) au-dessus des lignes ;
  filtrage à chaque lettre sans majuscules ni accents (`lib/search.ts`) dans toutes les sections (Budget, Prêts
  accordés, Remboursements d'emprunts, Dépenses non répertoriées) ; sections sans résultat masquées ; sinon
  « Aucune ligne ne correspond à « … ». ». La synthèse n'est pas filtrée.
- Dépenses › ligne de budget par recherche (`components/LineCombobox.tsx`, rôles combobox / listbox,
  `aria-activedescendant`) : suggestions dès la première lettre (sans majuscules ni accents, lettres tapées en gras,
  groupe en petit), lignes les plus utilisées sur 30 jours d'abord (`Line.recentUses`, `Line.lastUsed`, calculés
  dans `linesQuery`) ; champ vide : 5 dernières lignes utilisées ; flèches, Entrée, Échap ; suggestions de 44 px
  minimum. Une ligne doit être choisie pour enregistrer (« Choisissez une ligne de budget. ») ; sans résultat :
  « Aucune ligne trouvée » et « Créer la ligne « … » » (budget prévu 0, `addLine` renvoie l'identifiant). La
  dernière ligne utilisée est préremplie et reste choisie après une saisie.
- Budget › « Argent restant » (synthèse) : bouton « Voir le détail › » qui ouvre le panneau « Reste par ligne »
  (`components/RestSheet.tsx` : monte du bas sur téléphone, centré à partir de 768 px ; croix, Échap ou appui à
  l'extérieur ; focus gardé dans le panneau). Titre + période (« novembre 2026 · 22 oct. – 21 nov. »), tableau
  Ligne · Prévu · Dépensé · Reste des lignes au budget prévu > 0 dont le reste est positif, groupées comme le
  Budget (groupe vide masqué), triées du plus grand reste au plus petit ; « Total restant sur les lignes » ; sinon
  « Toutes les lignes sont entièrement dépensées. ». Sous le total, détail de ce qui complète l'argent restant
  (`restBreakdown` dans `lib/ledger.ts`), une ligne par élément non nul, signé : « Revenus non affectés à une ligne »
  (ou « Part des restes non couverte par les revenus » si négatif), « Emprunts reçus », « Dépenses sans plafond »
  (lignes à budget 0, hors ligne système), « Rapprochements (entrées − dépenses non répertoriées) » (revenus dont le
  libellé commence par « Entrée non répertoriée », `UNLISTED_INCOME`, moins la ligne système), puis « Argent
  restant : Y FCFA ». Par construction, total + détail = argent restant de la synthèse.
  Calculé depuis les données déjà chargées (mêmes chiffres que `lineState`, aucune requête de plus). Un appui sur
  une ligne ferme le panneau et fait défiler jusqu'à la carte `#line-<id>`, signalée brièvement (`.flash`).

### Mois budgétaire (`lib/period.ts`, `lib/period-server.ts`, `app/month-actions.ts`, migrations 008 et 010)
- Un « mois » est une période enregistrée dans `budget_periods` (clé `month` = 1er jour du mois de la clé, `name`
  — NULL = mois de la clé —, `start_date`, `end_date` incluses, `closed_at`). Sans trou ni chevauchement :
  contrainte d'exclusion (`btree_gist`) et déclencheur de contrainte vérifiés en fin de transaction ; un seul mois
  ouvert par utilisateur (index unique `end_date IS NULL`), toujours le dernier. Les clés se suivent de mois en
  mois (URL `?m=YYYY-MM`, `monthly_budgets.month`, `monthly_budgets.period_id`).
- Le mois en cours n'a pas de fin (`end_date` NULL) : il reste ouvert jusqu'à sa clôture, sans limite. Toute date
  à partir de son ouverture lui appartient : tant qu'il est ouvert, toute nouvelle saisie lui revient.
- Clôture (`closeMonth`, barre du mois) : fin du mois à la date du jour (`closed_at`), budgets prévus figés, mois
  suivant (clé + 1) ouvert le lendemain avec les budgets préparés pour lui (sinon ceux par défaut des lignes). Une
  seule clôture par mois (la clé doit être celle du mois ouvert, ouvert au plus tard aujourd'hui). Annulation
  (`reopenMonth`, lien « Annuler » de la notification pendant 6 secondes) seulement si aucun mouvement n'a été
  saisi dans le nouveau mois. Le jour de la clôture, une saisie dans le nouveau mois est datée de son ouverture.
- Nom automatique (premier mois, nouvel utilisateur ou « Tout réinitialiser ») : ouverture le 15 ou après → mois
  suivant (ouvert le 24 novembre → « décembre 2026 »), sinon mois de l'ouverture (`keyForOpening`). Ensuite, chaque
  nouveau mois prend le nom qui suit celui du mois clôturé, même s'il s'ouvre avant le 15 (jamais de doublon).
- Mois prévus (après le mois en cours, flèche droite du sélecteur) : ouverture provisoire le même jour du mois que
  l'ouverture du mois en cours, n mois plus tard (`addMonths`, borné au dernier jour) ; « prévu à partir du … ».
  Budget consultable et budgets prévus modifiables (enregistrés pour ce mois dans `monthly_budgets`, gardés à la
  clôture) ; Dépenses et Revenus affichent « Ce mois s'ouvrira à la clôture de [mois en cours]. » et le serveur
  refuse toute saisie. Avant le premier mois enregistré : de mois en mois, même règle vers le passé.
- `getPeriodSettings(userId)` (une lecture par requête, `cache`) charge les mois et garantit un mois ouvert et la
  ligne système (voir Rapprochement). Migration 010 : mois futurs enregistrés retirés (budgets préparés gardés),
  le dernier mois de chaque utilisateur devient le mois en cours, ouvert ; mois passés et budgets figés inchangés.
- Une seule logique, jamais de `date_trunc('month', …)` ni de « 1er du mois » écrit à la main : `periodDates` /
  `periodStart` / `periodEnd` (null pour le mois ouvert) / `periodOf` / `currentPeriod` (mois ouvert) /
  `periodStatus` / `periodName` / `periodRange` / `periodTitle` / `isCalendarPeriod` / `dayInPeriod` côté JS ;
  `periodBounds(key, ps)` (bornes [lo, hi[, sans borne haute pour le mois ouvert), `currentKeySql(ps)` et
  `periodKeySql(col, ps)` (même règle que `periodOf`, vérifiée sur 19 920 instants) côté SQL.
- Barre du mois (Dépenses, Revenus, Budget) : sous le nom, « 22 oct. – 21 nov. » (clôturé), « depuis le 24 oct. ·
  en cours » ou « prévu à partir du 22 nov. ». À côté, sur le mois en cours seulement (et pas le jour même où il a
  été créé par une clôture) : bouton « Clôturer » (cadenas, bordure et texte `--out`, hauteur du sélecteur) ;
  encadré de confirmation dessous (« Clôturer [mois] aujourd'hui, [date] ? » / « [mois suivant] commencera demain,
  le [date], avec les budgets prévus. », « Clôturer » et « Annuler ») ; après validation, le sélecteur passe sur le
  nouveau mois et la notification « [Mois] est clôturé. [Mois suivant] commence le [date]. » propose « Annuler ».
- Plus aucun réglage des mois : la partie « Mois budgétaire » des Réglages et « Clôturer ce mois » du Budget ont
  disparu (`user_settings.start_day` et `period_naming` ne servent plus).
- Un dépassement de budget sur un mois clôturé (données anciennes) n'est pas bloqué : ligne en orange
  (`.over-dates`).

### Rapprochement : ligne « Dépenses non répertoriées »
- Ligne système par utilisateur (`budget_lines.system = 'unlisted'`, index unique, budget prévu toujours 0) créée
  par la migration puis par `getPeriodSettings` si elle manque (nouvel utilisateur, « Tout réinitialiser »). Ni
  supprimable (`deleteLine`) ni renommable, budget non modifiable (`setPlanned`) : sans plafond. En dernier dans le
  groupe Budget (Dépenses, Budget avec son « Dépensé », badge « Ligne système »). Elle compte comme toute dépense
  (totaux, reste disponible, épargne et caisse, rapports, impressions). L'écran de bienvenue ne la compte pas.
- Dépenses › carte « Reste disponible » (période en cours) : « Rapprocher avec mon argent réel » ouvre le panneau
  `components/ReconcileSheet.tsx` (panneau commun `components/Sheet.tsx`) : « Argent réellement disponible (FCFA) »,
  « Reste dans Mawnytrack », « Argent réel », « Écart ». Argent réel inférieur : « Enregistrer Z FCFA en dépenses
  non répertoriées » (dépense par `addExpense` sur la ligne système, « Rapprochement du [date] ») ; supérieur :
  « Enregistrer Z FCFA en entrée non répertoriée » (revenu « Entrée non répertoriée — rapprochement du [date] ») ;
  égal : « Les comptes sont équilibrés. ». Le reste disponible devient égal à l'argent réel saisi.
- Revenus et dépenses de la ligne système se modifient au toucher dans les journaux (`updateEntry`, montant,
  libellé, date jamais dans le futur) et se suppriment avec confirmation, comme les autres mouvements.

### Règle essentielle : aucun dépassement de budget
- Une ligne avec un budget prévu > 0 ne peut jamais avoir un dépensé du mois supérieur à ce budget.
- Une ligne à 0 n'a pas de plafond.
- Interface : dès la sélection d'une ligne épuisée, afficher « Budget déjà atteint pour « X ». Aucune nouvelle
  dépense possible sans modifier le budget prévu. » et désactiver le bouton ; pendant la saisie, si le montant
  dépasse le reste, afficher le reste disponible et désactiver le bouton (`checkExpense` dans `lib/ledger.ts`).
  Aucun encadré supplémentaire après une saisie (lignes de budget, de prêts et de remboursements d'emprunts) :
  le message rouge sous les champs, le bouton désactivé et la notification brève suffisent.
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
- Modification d'un mouvement (prêt accordé, remboursement reçu, emprunt reçu, remboursement d'emprunt) : un appui
  sur la ligne (historique de la fiche, journaux Dépenses et Revenus) ouvre dans la page le formulaire
  `components/MoveEditForm.tsx` (Montant, Libellé, Date, « Enregistrer », « Annuler » ou Échap). La transaction
  elle-même est modifiée (`updateMove` dans `app/(app)/prets/actions.ts`) : fiche, relevés, Budget, reste
  disponible, caisse et rapports suivent. Date jamais dans le futur ; nouvelle date = même heure locale.
- Contrôles de modification (`checkMove` dans `lib/ledger.ts`, pendant la saisie, et serveur dans une transaction
  sous verrou de la ligne puis de la personne, `FOR UPDATE`) ; une modification qui n'aggrave pas la situation
  reste possible ; refus avec le montant minimum ou maximum autorisé :
  - total remboursé jamais supérieur au total prêté ou emprunté (prêt ou emprunt jamais sous le déjà remboursé,
    remboursement jamais au-dessus du dû en comptant l'ancien montant) ;
  - personne `lent` : accordé jamais au-dessus du budget prévu de sa ligne ;
  - remboursement d'emprunt : jamais au-dessus du reste à rendre ni du budget de sa ligne pour la période de la
    nouvelle date (l'interface ne connaît que la période affichée ; le serveur contrôle les autres).
- Agrégats en SQL, une requête pour toutes les personnes ; mises à jour optimistes dans la liste, la fiche et les
  journaux (opération `edit` du réducteur).

## Caisse (`/caisse`, `lib/caisse.ts`)
- Par période (mois budgétaire), revenus `income` seuls (jamais les emprunts) :
  - « Épargne prévue » = revenus − budget prévu total de la période (valeurs figées de `monthly_budgets` pour les
    périodes terminées, figées à la consultation), minimum 0 ;
  - période terminée : épargne = revenus − dépenses nettes réelles (`expense` − `refund`), minimum 0, soit
    l'épargne prévue + le « non dépensé » (aucune ligne ne dépassant son budget, il est normalement positif ;
    négatif seulement si des lignes sans plafond l'emportent : affiché « dépenses hors budget ») ;
  - mois en cours : épargne = épargne prévue ; le non dépensé n'est ajouté qu'à la clôture du mois (bouton
    « Clôturer ») — même règle partout (`savingSplit` dans `lib/ledger.ts` côté interface).
- Disponible en caisse = somme des épargnes, de la première période ayant un revenu à la période en cours,
  − toutes les sorties vers les investissements (`project_disbursements`) − les approvisionnements des projets
  + leurs restitutions (`project_moves`, voir Investissements › Projets). Historique calculé en une seule requête
  SQL (`savingsCtes`), recalculé à chaque lecture : modifier ou supprimer une transaction d'une période terminée met
  à jour son épargne et la caisse. `caisseAvailableSql` sert aussi au contrôle des sorties (Investissements) et au
  rapport hebdomadaire.
- Écran : carte « Disponible en caisse » (total épargné, « dont non dépensé : Z », total investi, lien vers
  Investissements), graphique « Évolution » (caisse cumulée en courbe pleine avec dégradé, épargne de la période en
  pointillés `--out`), « Détail par mois » du plus récent au plus ancien. Chaque période : en-tête (nom, dates ;
  à droite le montant ajouté à la caisse puis « Caisse à ce jour » ou « Caisse en fin de période »), puis un petit
  tableau libellé / montant aligné à droite (`.cm-tbl`) :
  - période en cours : Revenus, − Budget prévu, = Épargne prévue (gras), Dépensé à ce jour, Non dépensé à ce jour
    (gris), mention « Ajouté à la caisse à la clôture du mois pour la part restant non dépensée » ;
  - période terminée : Revenus, − Dépenses réelles, = Épargne de la période (gras), puis « dont épargne prévue X
    + non dépensé Y » ;
  - « Sorties vers les investissements : X » en dessous quand la période en a.
- Budget › « Épargne supplémentaire » : épargne prévue, puis « + non dépensé à ce jour : X FCFA (ajouté à la caisse
  à la clôture du mois) » pour le mois en cours (« (ajouté à la caisse le [dernier jour]) » pour un mois clôturé).

## Investissements (`/investissements`)
- Deux types d'éléments : les projets (caisse propre, ci-dessous) et les budgets. Le type « Investissement » a
  disparu (migration `009_event_budgets.sql` : chaque investissement est devenu un projet, ses sorties de caisse
  des approvisionnements `fund` de même montant, libellé et date ; caisse principale inchangée).
  `project_disbursements` reste vide et n'est plus alimentée.
- Filtre Tout · Budgets · Projets (`?vue=budgets|projets`) ; résumé du haut selon le filtre (voir Projets ;
  « Budgets » : total prévu et nombre de budgets). « + Nouveau projet » (nom, montant nécessaire) ; sous la liste des
  budgets, encadré « Nouveau budget » (un champ, « Créer »).

### Budgets (`budgets`, `budget_categories`, `budget_items`, migration `011_budgets.sql`, `lib/budgets.ts`, `budget-actions.ts`)
- Listes indépendantes (rentrée scolaire, travaux, voyage, fête…) : aucun lien avec la caisse, le budget mensuel ni
  les dépenses. Budget → catégories (nom, position) → lignes (libellé, montant, position). Migration 011 : chaque
  ancien budget d'événement devient un budget (même identifiant), ses catégories et articles repris dans l'ordre ;
  date d'événement et notes abandonnées ; tables `event_budgets` et `event_budget_items` supprimées.
- Liste : carte par budget (initiale dans un carré vert clair, nom, « X catégories · Y lignes », total à droite).
  Après « Créer », le budget s'ouvre (`?nouveau`) avec le nom de la première catégorie prêt à la saisie.
- Fiche `/investissements/budgets/[id]` (`components/BudgetDetailView.tsx`) : retour « Budgets », icône
  d'impression, nom en grand (modifiable au toucher), « Budget » dessous ; bandeau vert foncé Catégories · Lignes ·
  Total ; catégories repliables (plusieurs ouvertes à la fois ; fermée : nom, « X lignes », sous-total, chevron qui
  pivote) ; ouverte : lignes (libellé, montant, corbeille avec confirmation), puis Libellé / Montant / « + » (focus
  rendu au Libellé) ; vide : « Aucune ligne. Ajoutez la première ci-dessous. » ; « Renommer » et « Supprimer la
  catégorie » (confirmation dans la page, lignes comprises). Bouton pointillé « + Créer une catégorie » → champ +
  « Créer » ; la catégorie créée s'ouvre, libellé prêt. Ligne modifiable au toucher du libellé ou par appui long
  (550 ms). Ordre des catégories et des lignes par glisser-déposer (poignée, souris ou doigt) ou flèches haut et
  bas sur la poignée. « Total du budget : X FCFA » en gras sous un trait épais ; « Dupliquer ce budget »
  (« (copie) », catégories et lignes copiées) et « Supprimer ce budget » (confirmation).
- PDF `/investissements/budgets/[id]/pdf` dans l'aperçu habituel : logo + « BUDGET », à droite le nom en grand et
  « Établi le … » (`rightLines`), trait épais ; trois cases grises Lignes · Catégories · Total (`boxes`) ; tableau
  Désignation · Montant, titre de catégorie (style `group`, vert, majuscules), « Sous-total » (style `subtotal`),
  « Total » (style `total`) ; pied « Mawnytrack · Budget · [nom] » et « Page X / Y ». Fichier
  `Budget-[nom]-[date].pdf`.
- Export et « Tout réinitialiser » incluent `budgets`, `budget_categories` et `budget_items`.

### Projets : caisse propre (`project_moves`, migration `007_project_moves.sql`, `lib/project-cash.ts`)
- Table `project_moves` (type `fund` = approvisionnement depuis la caisse principale, `out` = sortie du projet,
  `back` = restitution du solde à la caisse principale) ; `projects.closed_at` (projet clôturé, lecture seule).
  Reprise : les anciennes sorties des projets sont devenues des `fund` (même montant, libellé, date).
- Alloué = approvisionnements − restitutions ; solde du projet = alloué − sorties. Caisse principale :
  disponible = épargnes − sorties des investissements − approvisionnements + restitutions (`caisseAvailableSql`).
  Les sorties d'un projet ne touchent ni la caisse principale, ni le budget, ni les dépenses du mois.
- Règles (`checkProjectMove`, interface pendant la saisie, et serveur dans une transaction sous le verrou
  `pg_advisory_xact_lock` de la caisse, conditions SQL `allowed`) : solde du projet et caisse principale jamais
  négatifs, alloué jamais au-delà du montant nécessaire (modifiable, jamais sous l'alloué) ; une modification qui
  n'aggrave rien reste possible ; suppression avec les mêmes contrôles ; projet clôturé en lecture seule.
- Fiche (`components/ProjectCashView.tsx`) : retour « Investissements », icône d'impression (rapport complet) ;
  initiale, nom, « Projet », statut « En préparation » / « En cours » / « Clôturé » ; totaux Alloué · Dépensé
  (`--out`) · Solde du projet (`--in`) ; montant nécessaire et jauge « Alloué X / nécessaire Y » ;
  « + Approvisionner depuis la caisse » (rappel du disponible de la caisse principale) et « + Enregistrer une
  sortie » (ouvert, bouton orange rosé ; « La caisse du projet est vide. Approvisionnez-la d'abord. ») ;
  après une sortie, encadré vert clair `.okbox` (montant, libellé, nouveau solde, bouton « Rapport », croix).
  « Mouvements » du plus récent au plus ancien (approvisionnements et restitutions en vert, sorties en orange
  rosé, icône d'impression sur chaque sortie), modification au toucher (`MoveEditForm`, paramètre `check`) et
  suppression confirmée dans la page. En bas : « Clôturer le projet » (« Confirmer : rendre X FCFA à la caisse et
  clôturer » : restitution du solde puis `closed_at`) et « Supprimer ce projet » (l'alloué revient en caisse).
- Liste : cartes Projet avec le solde en grand, « Alloué X / nécessaire Y » et « Dépensé Z ». Résumé du haut
  selon le filtre : « Tout » garde le résumé d'origine (Disponible en caisse, Déjà investi = alloué aux projets,
  Reste à financer), sans chiffre des caisses de projets ; « Budgets » : total prévu des budgets ; « Projets » affiche « Disponible
  dans la caisse principale », « Dans les caisses des projets » (somme des soldes) et « Dépensé sur les projets ».
  La section « Projets clôturés » (en bas) n'apparaît qu'avec le filtre « Projets ».
- Rapport (`lib/project-report.ts`, page `/investissements/[id]/rapport?apres=<sortie>` et PDF
  `/rapport/pdf`) : complet ou après une sortie (mouvements jusqu'à elle, ligne surlignée en `--out-soft`, gras ;
  style PDF `highlight`). Date · Libellé · Entrée · Sortie · Solde (« (restitution) »), « Totaux », « Solde du
  projet après cette sortie » / « à ce jour », mention « Alloué depuis la caisse · Dépensé · Restitué à la caisse ».
  « Imprimer » ouvre l'aperçu ; fichier `Rapport-[projet]-[AAAA-MM-JJ].pdf`. Téléphone : dates JJ/MM.
- Caisse : « vers projets X » (approvisionnements − restitutions de la période) à côté des investissements ;
  « Total investi » inclut l'alloué aux projets (« dont vers projets »). Rapport hebdomadaire : sections
  « Projets · approvisionnements et sorties de la semaine » et « Projets · solde de chaque caisse », et « Dans
  les caisses des projets » dans la synthèse de l'e-mail. Export et « Tout réinitialiser » incluent `project_moves`.

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
  périodes, personnes, projets, sorties de caisse, mouvements des caisses des projets, rapports hebdomadaires et
  réglages (mois en cours et ligne système recréés à la consultation suivante, ouverts le jour même) ; seuls l'e-mail et le mot de passe restent ; autres appareils déconnectés ; retour à Dépenses.
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

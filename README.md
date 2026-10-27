# Mawnytrack

Suivi des finances personnelles en FCFA : dépenses, revenus et budget du mois.

- Prototype de référence : `docs/prototype-mawnytrack.html`
- Règles métier et mode de travail : `CLAUDE.md`

## Mise en route

1. Les migrations de `db/migrations/` s'appliquent automatiquement avant chaque compilation (`npm run build`,
   donc à chaque déploiement Vercel). Lancement manuel : `npm run migrate`.
2. Variables d'environnement (voir `.env.example`) : `DATABASE_URL` (et `DATABASE_URL_UNPOOLED` si disponible), `BETTER_AUTH_SECRET`, `RESEND_API_KEY`, `CRON_SECRET` (rapport hebdomadaire).
3. `npm install` puis `npm run dev`.

## Scripts

- `npm run dev` : serveur de développement
- `npm run build` : migrations SQL puis compilation de production
- `npm run migrate` : applique les migrations SQL en attente
- `npm run typecheck` : vérification TypeScript
- `npm run icons` : régénère les icônes PNG et le favicon depuis `public/mawnytrack-icon.svg`

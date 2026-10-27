# Mawnytrack

Suivi des finances personnelles en FCFA : dépenses, revenus et budget du mois.

- Prototype de référence : `docs/prototype-mawnytrack.html`
- Règles métier et mode de travail : `CLAUDE.md`

## Mise en route

1. Exécuter dans l'éditeur SQL de Neon, dans l'ordre :
   1. `db/migrations/001_auth.sql`
   2. `db/migrations/002_schema.sql`
2. Variables d'environnement (voir `.env.example`) : `DATABASE_URL`, `BETTER_AUTH_SECRET`.
3. `npm install` puis `npm run dev`.

## Scripts

- `npm run dev` : serveur de développement
- `npm run build` : compilation de production
- `npm run typecheck` : vérification TypeScript
- `npm run icons` : régénère les icônes PNG et le favicon depuis `public/mawnytrack-icon.svg`

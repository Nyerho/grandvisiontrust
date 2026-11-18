# Cloudflare Workers deployment

This repository is prepared to publish its existing HTML pages and approved frontend assets with **Cloudflare Workers Static Assets**. The Cloudflare Worker routes `/api` and `/api/*` to an explicit `503 api_not_migrated` response until the backend is migrated to a durable Cloudflare database.

## Deploy

1. Install dependencies with `npm ci`.
2. Authenticate Wrangler with `npx wrangler login`.
3. Preview locally with `npm run cf:dev`.
4. Deploy with `npm run cf:deploy`.

The Wrangler configuration is in `wrangler.jsonc`. The `cf:build` script regenerates `cloudflare-public/` from an allowlist: root HTML pages, the frontend JavaScript libraries, selected public brand images, and `placeholder.svg`. Database files, uploaded storage, backend source, and repository metadata are excluded from static publishing.

For Git-based deployment from Cloudflare's dashboard, configure the build command as `npm run cf:build` and use the Wrangler/Workers deployment flow rather than a Pages static-only preset. Set the Cloudflare build system to install dependencies from `package-lock.json` so Wrangler is available.

## API and data migration required

The existing Express API reads and writes a local `sql.js` database file. A Worker cannot use a local file as durable shared application storage. This configuration does **not** port the API to Workers or migrate the database to D1. API routes return HTTP 503 intentionally; registration, login, account changes, transfers, and other backend operations will not work until this is completed.

Before enabling those features, port the current SQL access layer and authentication/session handling to Cloudflare Workers and bind a Cloudflare D1 database. If existing records must be retained, export and migrate them deliberately. Do not deploy as a production banking service or use for real financial data until the API migration, security review, and compliance checks are complete.

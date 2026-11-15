# Netlify deployment

This repository is configured for Netlify as a static site with an Express API hosted by a Netlify Function.

## Deploy

1. Import the GitHub repository `Nyerho/grandvisiontrust` in Netlify.
2. Keep the build command empty; the publish directory is `.` and the Functions directory is `netlify/functions` in `netlify.toml`.
3. In **Site configuration → Environment variables**, set `SESSION_SECRET` to a long, random secret. Netlify's `APP_ORIGIN` is optional; set it to the canonical site origin (for example, `https://example.netlify.app`) if the application needs an explicit origin.
4. Deploy the site. Netlify will install the dependencies from `package-lock.json`, publish the HTML/assets, and bundle `netlify/functions/api.js`.

The `/api` redirects send API requests to the `api` Netlify Function. Direct static HTML routes and assets continue to be served from the repository root.

## Important data limitation

The current backend stores its SQLite-compatible database in a local file. On Netlify Functions, the writable `/tmp` directory is temporary and local to a function instance; it is not durable or shared between instances. Consequently, accounts, applications, transfers, and other records created through this backend can be lost or appear inconsistent after a cold start, redeploy, or invocation on another instance. This configuration is suitable for deployment testing, but **not for real financial or production account data**. Before production use, migrate persistence to a managed external database and review the application's security, compliance, and data-handling requirements.

## Local checks

- `npm ci` installs the locked dependencies.
- `npx netlify-cli dev` can be used to test static pages and functions locally (Netlify CLI is not a project dependency).

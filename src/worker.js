export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return Response.json({ ok: true, runtime: "cloudflare-workers", api: "not-configured" });
    }

    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
      return Response.json(
        {
          error: "api_not_migrated",
          message: "The API still uses a local sql.js database. Migrate it to Cloudflare D1 before enabling account or transaction operations."
        },
        { status: 503 }
      );
    }

    return env.ASSETS.fetch(request);
  }
};

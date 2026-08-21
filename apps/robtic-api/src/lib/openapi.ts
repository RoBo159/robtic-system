import { API_ROUTES } from "@sdk";
import type { Route } from "../router";
import { API_VERSION } from "../controllers/plugin-controller";

/**
 * Generates the OpenAPI document from the live route table.
 *
 * Deriving it from the same array the router dispatches on means the documentation cannot drift:
 * a route that is not registered is not documented, and one that is registered always is.
 */
export function buildOpenApiDocument(routes: readonly Route[]): Record<string, unknown> {
    const paths: Record<string, Record<string, unknown>> = {};

    for (const route of routes) {
        const path =
            typeof route.path === "string"
                ? route.path
                : route.path === API_ROUTES.economy.coinsPattern
                  ? "/api/economy/coins/{uuid}"
                  : route.path.source;

        paths[path] ??= {};
        paths[path][route.method.toLowerCase()] = {
            summary: route.summary,
            tags: [route.tag],
            security: [{ bearerAuth: [] }],
            parameters:
                route.method === "GET"
                    ? [
                          {
                              name: "guildId",
                              in: "query",
                              required: false,
                              schema: { type: "string" },
                              description: "Defaults to the guild the API key is bound to",
                          },
                      ]
                    : undefined,
            responses: {
                "200": {
                    description: "Success",
                    content: {
                        "application/json": {
                            schema: {
                                type: "object",
                                properties: { ok: { type: "boolean", enum: [true] }, data: { type: "object" } },
                            },
                        },
                    },
                },
                "401": { description: "Missing, unknown or revoked API key" },
                "403": { description: "The key lacks the required scope, guild or server" },
                "422": { description: "Request body failed validation" },
                "429": { description: "Rate limit exceeded" },
            },
        };
    }

    return {
        openapi: "3.1.0",
        info: {
            title: "Robtic API",
            version: API_VERSION,
            description:
                "The only service permitted to reach MongoDB. The Discord bot and the Minecraft plugin are both clients of it.",
        },
        servers: [{ url: process.env.ROBTIC_API_PUBLIC_URL ?? "http://localhost:3002" }],
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: "http",
                    scheme: "bearer",
                    description: "An API key issued with `/minecraft apikey create`, sent as `Authorization: Bearer …`",
                },
            },
        },
        security: [{ bearerAuth: [] }],
        paths,
    };
}

/**
 * A self-contained documentation page.
 *
 * Rendered from the spec inline rather than pulling Swagger UI from a CDN, so the page works on a
 * host with no outbound internet access and adds no third-party script to an authenticated origin.
 */
export function renderDocsPage(): string {
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Robtic API</title>
<style>
  :root { color-scheme: light dark; --fg:#111; --bg:#fff; --muted:#666; --line:#e3e3e3; --get:#2f6f4f; --post:#1f4e79; }
  @media (prefers-color-scheme: dark) { :root { --fg:#e8e8e8; --bg:#141414; --muted:#9a9a9a; --line:#2c2c2c; --get:#7fd1a8; --post:#7fb3e8; } }
  body { margin:0; padding:2rem 1.25rem 4rem; font:15px/1.6 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif; color:var(--fg); background:var(--bg); }
  main { max-width:52rem; margin:0 auto; }
  h1 { font-size:1.6rem; margin:0 0 .25rem; }
  p.lede { color:var(--muted); margin:0 0 2rem; }
  h2 { font-size:1.05rem; margin:2rem 0 .5rem; padding-bottom:.35rem; border-bottom:1px solid var(--line); }
  ul { list-style:none; padding:0; margin:0; }
  li { display:flex; gap:.75rem; align-items:baseline; padding:.4rem 0; border-bottom:1px solid var(--line); flex-wrap:wrap; }
  .m { font:600 11px/1 ui-monospace,SFMono-Regular,Menlo,monospace; letter-spacing:.06em; padding:.3rem .45rem; border-radius:4px; border:1px solid currentColor; }
  .get { color:var(--get); } .post { color:var(--post); }
  code { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:13px; }
  .s { color:var(--muted); flex:1 1 18rem; }
</style>
</head>
<body>
<main>
  <h1>Robtic API</h1>
  <p class="lede">Every endpoint requires <code>Authorization: Bearer &lt;api-key&gt;</code>.
     The machine-readable spec is at <a href="${API_ROUTES.openapi}">${API_ROUTES.openapi}</a>.</p>
  <div id="out"></div>
</main>
<script>
fetch(${JSON.stringify(API_ROUTES.openapi)})
  .then(r => r.json())
  .then(spec => {
    const groups = new Map();
    for (const [path, methods] of Object.entries(spec.paths)) {
      for (const [method, op] of Object.entries(methods)) {
        const tag = (op.tags && op.tags[0]) || "Other";
        if (!groups.has(tag)) groups.set(tag, []);
        groups.get(tag).push({ method, path, summary: op.summary });
      }
    }
    const out = document.getElementById("out");
    for (const [tag, rows] of groups) {
      const h = document.createElement("h2");
      h.textContent = tag;
      out.appendChild(h);
      const ul = document.createElement("ul");
      for (const row of rows.sort((a, b) => a.path.localeCompare(b.path))) {
        const li = document.createElement("li");
        const m = document.createElement("span");
        m.className = "m " + row.method;
        m.textContent = row.method.toUpperCase();
        const c = document.createElement("code");
        c.textContent = row.path;
        const s = document.createElement("span");
        s.className = "s";
        s.textContent = row.summary || "";
        li.append(m, c, s);
        ul.appendChild(li);
      }
      out.appendChild(ul);
    }
  })
  .catch(() => { document.getElementById("out").textContent = "Could not load the specification."; });
</script>
</body>
</html>`;
}

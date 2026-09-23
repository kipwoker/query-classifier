import index from "./index.html";

const PORT = Number(process.env.CLIENT_PORT ?? 3000);
const API_URL = process.env.API_URL ?? "http://localhost:3001";

const server = Bun.serve({
  port: PORT,
  routes: {
    "/": index,
    "/api/*": async (req) => {
      const url = new URL(req.url);
      const target = `${API_URL}${url.pathname.replace(/^\/api/, "")}${url.search}`;
      const upstream = await fetch(target, {
        method: req.method,
        headers: req.headers,
        body: req.method === "GET" || req.method === "HEAD" ? undefined : await req.blob(),
      });
      return new Response(upstream.body, { status: upstream.status, headers: upstream.headers });
    },
  },
  development: { hmr: true, console: true },
});

console.log(`query-classifier client listening on http://localhost:${server.port} (proxying /api to ${API_URL})`);

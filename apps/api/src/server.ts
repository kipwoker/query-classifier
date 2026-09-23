import { classify, DOMAINS, DEFAULT_DOMAIN, type DomainName } from "@query-classifier/domain";
import { loadSettings, getSettings, updateSettings, checkStatus, listOllamaModels, type Settings } from "./settings";

const PORT = Number(process.env.PORT ?? 3001);
const DOMAINS_DIR = new URL("../../../domains/", import.meta.url);

await loadSettings();

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function isDomainName(value: string): value is DomainName {
  return value in DOMAINS;
}

const server = Bun.serve({
  port: PORT,
  routes: {
    "/health": () => json({ status: "ok" }),

    "/domains": () =>
      json(
        Object.values(DOMAINS).map((d) => ({ name: d.name, entityListLabel: d.entityListLabel })),
      ),

    "/examples": async (req) => {
      const domainParam = new URL(req.url).searchParams.get("domain") ?? DEFAULT_DOMAIN;
      if (!isDomainName(domainParam)) {
        return json({ error: `unknown domain "${domainParam}"` }, 400);
      }
      const examplesPath = new URL(`${domainParam}.examples.json`, DOMAINS_DIR);
      const cases = (await Bun.file(examplesPath).json()) as { query: string; schema?: unknown }[];
      return json(cases);
    },

    "/classify": {
      POST: async (req) => {
        const body = (await req.json()) as { query?: string; domain?: string };
        if (!body.query || typeof body.query !== "string") {
          return json({ error: "expected { query: string }" }, 400);
        }
        const domainParam = body.domain ?? DEFAULT_DOMAIN;
        if (!isDomainName(domainParam)) {
          return json({ error: `unknown domain "${domainParam}"` }, 400);
        }
        const outcome = await classify(body.query, domainParam);
        return json({ result: outcome.result, trace: outcome.trace.toOtlpJson() });
      },
    },

    // SSE variant of /classify - streams each span as it completes (real
    // progress, not simulated) and a final "done" event with the same
    // {result, trace} payload /classify returns. GET + query params (not a
    // POST body) so the browser's native EventSource can hit it directly.
    "/classify/stream": (req) => {
      const url = new URL(req.url);
      const query = url.searchParams.get("query");
      const domainParam = url.searchParams.get("domain") ?? DEFAULT_DOMAIN;
      if (!query) {
        return json({ error: "expected ?query=" }, 400);
      }
      if (!isDomainName(domainParam)) {
        return json({ error: `unknown domain "${domainParam}"` }, 400);
      }

      const stream = new ReadableStream({
        async start(controller) {
          const send = (event: string, data: unknown) => {
            controller.enqueue(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
          };
          try {
            const outcome = await classify(query, domainParam, (span) => send("span", span));
            send("done", { result: outcome.result, trace: outcome.trace.toOtlpJson() });
          } catch (err) {
            // Named "failed", not "error" - EventSource reserves "error"
            // for transport-level failures, so a custom "event: error"
            // from the server would collide with that native event type
            // on the client (see useClassifyStream.ts).
            send("failed", { message: err instanceof Error ? err.message : String(err) });
          } finally {
            controller.close();
          }
        },
      });
      return new Response(stream, {
        headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
      });
    },

    "/settings": {
      GET: () => json(getSettings()),
      POST: async (req) => {
        const body = (await req.json()) as Partial<Settings>;
        return json(await updateSettings(body));
      },
    },

    "/settings/status": () => checkStatus().then(json),

    "/settings/ollama-models": async (req) => {
      const url = new URL(req.url).searchParams.get("url") || getSettings().ollamaUrl;
      const models = await listOllamaModels(url);
      return json({ models });
    },
  },
  error(err) {
    console.error(err);
    return json({ error: "internal error" }, 500);
  },
});

console.log(`query-classifier API listening on http://localhost:${server.port}`);

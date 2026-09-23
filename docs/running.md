# Running it

## Prerequisites

| Requirement | How |
|---|---|
| laya service | `cd ../laya && docker compose -f compose.yaml -f compose.serve.yaml up -d --build` — the official quickstart's `compose.yaml` alone only runs a one-shot batch example with no server/port; `compose.serve.yaml` is our own override that builds the `[serve]` extra and runs `laya-serve` on port 8000 |
| ollama | Local, with `qwen3.5:0.8b` pulled — NOT the `-mlx` build, which breaks JSON-schema enum constraints. Any other model may work too. |
| Bun | [bun.sh](https://bun.sh) |

## Setup

```
bun install
```

## Tests

```
bun test                  # unit tests only, mocked laya/llm clients
bun run test:integration  # hits the REAL services - opt-in only, not run by default
```

## Benchmark

```
bun run benchmark         # runs domains/<domain>.examples.json (default: music), writes a dated report
bun run benchmark shop    # or against another configured domain
```

## Dev servers

```
bun run dev:api           # http://localhost:3001
bun run dev:client        # http://localhost:3000 (proxies /api/* to the api server)
```

## Full check

```
bun run verify            # unit tests + benchmark
```

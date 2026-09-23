# Benchmark

Automated accuracy measurement across every configured domain.

## How it works

- Fixtures: `domains/<name>.examples.json` — each example optionally pairs a query with its
  expected filter shape (`{query, schema?}`).
- Runner: `packages/benchmark/` — executes the pipeline per fixture and generates a markdown
  report.
- Template: `benchmarks/report-template/report.template.md` (committed).
- Output: `benchmarks/reports/<date>/` (gitignored) — one dated folder per run.

## Commands

```
bun run benchmark         # default domain: music
bun run benchmark shop    # or any other configured domain
```

A generated report lives under `benchmarks/reports/` for the per-case breakdown.

## Current state

Per-domain (fixtures live under `domains/<name>.examples.json`):

| Domain | Score |
|---|---|
| `shop` | 14/16 (88%) |
| `music` | 11/16 (69%) — notably lower; this domain surfaced a real bug the others didn't (see [known issues](known-issues.md)) |

Some variance is inherent to the self-consistency sampling in the kind-decision stage — re-run
before trusting a small delta.

## Experiments

Playground scripts for wording changes, isolated from the pipeline:

```
bun run experiment:laya-kind           # packages/domain/src/kind/laya-kind-experiment.ts
bun run experiment:laya-completeness   # packages/domain/src/kind/laya-completeness-experiment.ts
```

Both hit the live laya service directly. Use them to test wording changes before touching real
code — see [laya guidelines](laya-guidelines.md) for the methodology (and the documented
±2-3 case noise band).

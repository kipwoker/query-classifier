# Domain config

How domains are defined, compiled, and consumed by the pipeline.

## Files

| File | Role |
|---|---|
| `domains/<name>.json` | Entities, fields, types, descriptions, out-of-scope text for one domain. Source of truth for the generated schema. |
| `domains/<name>.examples.json` | UI quick-pick examples per domain, each optionally paired with its expected filter shape (`{query, schema?}`). Doubles as the benchmark fixture set. |

Currently `shop` and `music` — both artificial, built to prove out multi-domain support.

## Generated schema

`bun run generate:schema` reads every `domains/<name>.json` and compiles them into
`packages/domain/src/schema.generated.ts`:

- exports a `DOMAINS: Record<DomainName, DomainSchema>` registry
- exports the `DomainName` literal union (compiler-checked)
- `schema.ts` re-exports the generated file plus `schema-core.ts` (domain-agnostic engine
  types: `Kind`, `FieldType`, `FilterCondition`, `DomainSchema`, …), so every existing
  `from "./schema"` import keeps working

## How the pipeline consumes it

- `classify(query, domainName?)` looks up `DOMAINS[domainName]` (defaulting to `DEFAULT_DOMAIN`,
  the first domain generated) and puts the resolved `DomainSchema` on `StageContext.domain`.
- Every stage function reads entities/fields/descriptions off `ctx.domain` instead of a flat
  module-level import.
- No shared mutable "current domain" global — this is what makes concurrent requests for
  different domains safe.
- `EntityName` is a plain `string` rather than a literal union: different domains have entirely
  different entities, so one closed type spanning all of them stopped making sense the moment
  there was more than one domain loaded at once.
- Adding a domain means re-running `generate:schema` and rebuilding — not dropping in a new
  JSON file at runtime.

## Domain-agnostic rules

- Value extraction (`domain/src/value/deterministic-term.ts`) is keyed by `FieldType`
  (email/date/number regex), not by field name — a value's literal shape is a property of its
  type in any domain, not something specific to any one domain's field names.

## API / UI surface

| Endpoint | Purpose |
|---|---|
| `GET /domains` | Name + label per configured domain |
| `GET /examples?domain=` | That domain's quick-pick examples |
| `POST /classify` | Takes `{query, domain}` |

The client UI has a domain selector that drives both the example list and the classify call.

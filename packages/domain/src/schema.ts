// Aggregator - keeps every existing `from "./schema"` / `from "../schema"`
// import working unchanged. schema-core.ts holds the domain-agnostic engine
// types; schema.generated.ts holds the per-domain data, generated from
// domains/*.json (see scripts/generate-schema.ts) - swap domains by
// pointing that script at a different config and regenerating.
export * from "./schema-core";
export * from "./schema.generated";

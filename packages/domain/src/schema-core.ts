import { z } from "zod";

// Everything in this file is domain-agnostic - it describes the shape of
// comparisons and results, not any particular business's entities/fields.
// Per-domain data (entities, fields, descriptions) lives in schema.generated.ts,
// generated from a domains/*.json config - see scripts/generate-schema.ts.

export const FieldType = z.enum(["string", "number", "date", "email", "boolean", "self"]);
export type FieldType = z.infer<typeof FieldType>;

export interface FieldDef {
  type: FieldType;
  description: string;
}

// No longer a fixed literal union - each domain has its own entity set
// (see schema.generated.ts's DOMAINS registry), so a single closed type
// spanning every domain doesn't make sense. Kept as a named alias purely
// for readability at call sites that take an entity name.
export type EntityName = string;

// Everything one domain contributes - entities, fields, types, the
// out-of-scope rejection text. Threaded through StageContext (context.ts)
// rather than passed as a separate parameter to every stage function, so
// adding a domain never means touching every function signature.
export interface DomainSchema {
  name: string;
  entityListLabel: string;
  outOfScopeDescription: string;
  entityDescriptions: Record<string, string>;
  schema: Record<string, Record<string, FieldDef>>;
}

export const Kind = z.enum(["eq", "ne", "prefix", "suffix", "substring", "gt", "lt", "mine", "all"]);
export type Kind = z.infer<typeof Kind>;

export const KIND_DESCRIPTIONS: Record<Kind, string> = {
  mine: "the caller's own items, e.g. 'my items'",
  eq: "an exact match on a specific value, id, or email",
  ne: "the negation - NOT the given value, the opposite",
  prefix: "starts with / begins with the given text",
  suffix: "ends with the given text",
  substring: "contains / includes the given text anywhere",
  gt: "greater than / more than a numeric or date threshold",
  lt: "less than / fewer than a numeric or date threshold",
  all: 'no filter, list everything (includes plain sort/order requests like "the newest N")',
};

// Which comparison kinds are legal for each field type. "ne" is scoped to
// boolean only, not every type - email/number/date generally aren't
// phrased as negations in practice, and adding operators indiscriminately
// has already been tested and shown to dilute the signal (kind/decide-
// kind-laya.ts's >=/<= experiment made every case worse, not better).
export const KINDS_BY_TYPE: Record<FieldType, Kind[]> = {
  string: ["eq", "prefix", "suffix", "substring"],
  number: ["eq", "gt", "lt"],
  date: ["eq", "gt", "lt"],
  email: ["eq", "suffix"],
  boolean: ["eq", "ne"],
  self: [], // resolved immediately as kind="mine", no comparison needed
};

// Field types rendered as bare numeric literals in SQL (render-condition-
// sql.ts) - everything else (string/date/email/boolean) is quoted.
export const NUMERIC_TYPES: ReadonlySet<FieldType> = new Set(["number"]);

// Kinds with no literal value to extract by definition - a query with one
// of these has no "term" for value.resolve to find, and no-filter.check is
// skipped for the same reason.
export const TERM_FREE_KINDS: ReadonlySet<Kind> = new Set(["mine", "all"]);

export const FilterCondition = z.object({
  field: z.string(),
  kind: Kind,
  terms: z.array(z.string()),
  type: FieldType,
});
export type FilterCondition = z.infer<typeof FilterCondition>;

export const Combinator = z.enum(["and", "or"]);
export type Combinator = z.infer<typeof Combinator>;

export const ClassifyResult = z.object({
  entity: z.string(),
  // No brackets/grouping - a flat chain, each condition joined to the
  // next by combinators[i] (so combinators.length === filters.length - 1).
  filters: z.array(FilterCondition).min(1),
  combinators: z.array(Combinator),
  pagination: z.object({ limit: z.number() }),
});
export type ClassifyResult = z.infer<typeof ClassifyResult>;

export const OutOfScopeResult = z.object({
  inScope: z.literal(false),
  reason: z.enum(["irrelevant", "unclear"]),
  message: z.string(),
});
export type OutOfScopeResult = z.infer<typeof OutOfScopeResult>;

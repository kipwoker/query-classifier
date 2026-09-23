// Isolated experiment, NOT wired into pipeline.ts. Tests whether laya's
// `choice`, scoped to just the comparison operators legal for the field's
// type (a flat 8-way kind choice across all types scored 63% in earlier
// testing, type-scoped scored 86%), does better than the current
// self-consistency LLM (95% isolated) - specifically on the eq/substring
// and gt/lt boundary cases that stayed stuck at ~86% through three
// different wording attempts in that prior round. Entity/field/kind come
// from a domain's example fixtures' ground truth (not from the live
// field.select stage), so this measures laya's own accuracy in isolation,
// per this project's own testing convention.
// Run with: bun run packages/domain/src/kind/laya-kind-experiment.ts [domain]
import { layaChoice } from "@query-classifier/laya-client";
import { DOMAINS, DEFAULT_DOMAIN, KINDS_BY_TYPE, KIND_DESCRIPTIONS, type DomainName, type EntityName, type Kind } from "../schema";

interface FixtureCase {
  query: string;
  schema: { entity: EntityName; filters: { field: string; kind: Kind; terms: string[] }[] };
}

const domainArg = (process.argv[2] ?? DEFAULT_DOMAIN) as DomainName;
if (!(domainArg in DOMAINS)) {
  throw new Error(`unknown domain "${domainArg}" - configured domains: ${Object.keys(DOMAINS).join(", ")}`);
}
const domain = DOMAINS[domainArg];

const EXAMPLES_PATH = new URL(`../../../../domains/${domainArg}.examples.json`, import.meta.url);
const cases = (await Bun.file(EXAMPLES_PATH).json()) as FixtureCase[];

let scored = 0;
let matched = 0;

for (const { query, schema } of cases) {
  const { entity, filters } = schema;
  const { field, kind } = filters[0]!;

  if (kind === "all") {
    console.log(`[skip ] "${query}" - kind=all is decided elsewhere (no-filter gate), not a comparison choice`);
    continue;
  }

  const fieldType = domain.schema[entity]?.[field]?.type ?? null;
  if (!fieldType) {
    console.log(`[?    ] "${query}" - could not resolve a field type for ${entity}.${field} (kind=${kind})`);
    continue;
  }
  if (fieldType === "self") {
    console.log(`[fixed] "${query}" -> mine (type=self, no real choice, no laya call)`);
    continue;
  }

  const allowed = KINDS_BY_TYPE[fieldType];
  if (allowed.length <= 1) {
    console.log(`[fixed] "${query}" -> ${allowed[0]} (only one legal operator for type=${fieldType}, no laya call)`);
    continue;
  }

  const criteria: Record<string, string> = {};
  for (const candidate of allowed) criteria[candidate] = KIND_DESCRIPTIONS[candidate];

  const sql = `SELECT * FROM ${entity} WHERE ${field} `;
  const instructions = `Given the SQL built so far for this query, what kind of comparison is being requested on "${field}"?`;
  const answer = await layaChoice({ query, sql }, instructions, criteria);

  scored += 1;
  const ok = answer.choice === kind;
  if (ok) matched += 1;

  console.log(`[${ok ? "OK   " : "WRONG"}] "${query}"`);
  console.log(`         expected=${kind}  field=${field} (type=${fieldType})  candidates=[${allowed.join(", ")}]`);
  console.log(`         laya -> choice=${answer.choice}  confidence=${answer.confidence.toFixed(4)}`);
  console.log(`         probabilities: ${JSON.stringify(answer.probabilities)}`);
}

console.log(`\n${matched}/${scored} scored cases matched (kind=all and single-option types excluded, see [skip]/[fixed] rows above)`);

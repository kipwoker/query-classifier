import type { StageContext } from "../context";
import { withSpan } from "../util/with-span";
import { layaChoiceSpan } from "../util/laya-choice-span";
import { isNoFilter } from "../no-filter/is-no-filter";
import { narrateValue } from "../value/narrate-value";
import { reattachLeadingSymbol } from "../value/reattach-leading-symbol";
import { tryDeterministicTerms } from "../value/deterministic-term";
import { KINDS_BY_TYPE, KIND_DESCRIPTIONS, type EntityName, type FieldType, type Kind } from "../schema";

export interface KindDecision {
  kind: Kind;
  confidence: number;
  // Set only when this call already extracted the value as a side effect
  // (the LIKE-placement stage below) - lets the pipeline skip a redundant
  // second extraction.
  term?: string;
}

// string/email fields are all "= vs LIKE" text matches under the hood -
// scored as real SQL operators (see decideLikeFamilyKind), not as our
// internal eq/prefix/suffix/substring enum.
const LIKE_FAMILY_TYPES: ReadonlySet<FieldType> = new Set(["string", "email"]);

function likeLiteral(kind: Kind, value: string): string | undefined {
  switch (kind) {
    case "prefix":
      return `${value}%`;
    case "suffix":
      return `%${value}`;
    case "substring":
      return `%${value}%`;
    default:
      return undefined;
  }
}

type SetAttribute = (key: string, value: string | number | boolean) => void;

// Real SQL operator symbols, not our internal eq/gt/lt labels - same
// reasoning as the "= vs LIKE" stage below. Tested live: switching to
// symbol keys alone fixed a real "before X" -> lt misfire (eq/gt/lt gave
// eq=0.47 vs lt=0.34; =/>/</ gave </ winning). Also tried adding >=/<= as
// extra options on the theory that "before" might mean "lte" - that made
// every case WORSE (it flipped "after X" and "more than N" to the wrong
// direction too), so kept at 3 options, not 5.
export const COMPARISON_OPERATOR: Partial<Record<Kind, string>> = { eq: "=", ne: "!=", gt: ">", lt: "<" };

// Stage A: is this an exact match or a partial text match at all - scored
// as the literal SQL operators "=" / "LIKE", since laya is trained on real
// SQL, not on our internal kind labels. Stage B (only reached when LIKE
// wins and more than one wildcard placement is legal): extract the literal
// text once, then let laya pick which of the 3 completed LIKE patterns
// continues the query - e.g. for "tracks called Relax" it scores
// "Relax%" (prefix) vs "%Relax" (suffix) vs "%Relax%" (substring)
// against the actual SQL-so-far, not an abstract label.
async function decideLikeFamilyKind(
  ctx: StageContext,
  sqlPrefix: string,
  entity: EntityName,
  field: string,
  allowed: Kind[],
  query: string,
  setAttribute: SetAttribute,
): Promise<KindDecision> {
  const likeKinds = allowed.filter((k) => k !== "eq");
  const sqlSoFar = `${sqlPrefix}${field} `;
  const opCriteria = {
    "=": "an exact match on a specific, complete value",
    LIKE: "a partial text match - starts with, ends with, or contains some text",
  };
  const opInstructions = "Given the SQL built so far for this query, does the WHERE clause continue with an exact match or a partial text match?";
  const opAnswer = await layaChoiceSpan(ctx, query, sqlSoFar, opInstructions, opCriteria);

  if (opAnswer.choice === "=") {
    setAttribute("kind", "eq");
    setAttribute("confidence", opAnswer.confidence);
    setAttribute("source", "laya-sql-operator");
    return { kind: "eq", confidence: opAnswer.confidence };
  }

  if (likeKinds.length === 1) {
    const kind = likeKinds[0]!;
    setAttribute("kind", kind);
    setAttribute("confidence", opAnswer.confidence);
    setAttribute("source", "laya-sql-operator");
    return { kind, confidence: opAnswer.confidence };
  }

  // More than one wildcard placement is legal (string: prefix/suffix/
  // substring) - ask the no-filter gate BEFORE narrating a value, not
  // after: narrateValue's own doc comment warns that narrating "filtered
  // by X" on a genuinely filter-less query primes it to invent a value
  // instead of saying null (confirmed live: "Show me all tracks"
  // hallucinated "track" as its value once this check was skipped).
  const noFilter = await isNoFilter(ctx, entity, field, query);
  if (noFilter) {
    setAttribute("kind", "all");
    setAttribute("confidence", opAnswer.confidence);
    setAttribute("source", "laya-sql-operator-no-filter");
    return { kind: "all", confidence: opAnswer.confidence };
  }

  // Need the literal text before we can build the candidate completions.
  // Kind-agnostic on purpose: which placement wins hasn't been decided yet.
  const extracted = await narrateValue(ctx, entity, field, undefined, query);
  if (!extracted) {
    setAttribute("kind", "all");
    setAttribute("confidence", opAnswer.confidence);
    setAttribute("source", "laya-sql-operator-no-value");
    return { kind: "all", confidence: opAnswer.confidence };
  }
  // The model consistently drops a leading symbol ("-admins" -> "admins")
  // - same fix resolve-value.ts applies, needed here too since this path
  // never goes through resolve-value.ts at all.
  const value = reattachLeadingSymbol(query, extracted);

  const placementCriteria: Record<string, string> = {};
  const literalToKind = new Map<string, Kind>();
  for (const kind of likeKinds) {
    const literal = likeLiteral(kind, value);
    if (!literal) continue;
    placementCriteria[literal] = KIND_DESCRIPTIONS[kind];
    literalToKind.set(literal, kind);
  }
  const likeSqlSoFar = `${sqlPrefix}${field} LIKE '`;
  const placementInstructions = "Given the SQL built so far for this query, how does the LIKE pattern continue - where does the text sit relative to the wildcards?";
  const placementAnswer = await layaChoiceSpan(ctx, query, likeSqlSoFar, placementInstructions, placementCriteria);

  const kind = literalToKind.get(placementAnswer.choice) ?? "substring";
  setAttribute("kind", kind);
  setAttribute("confidence", placementAnswer.confidence);
  setAttribute("term", value);
  setAttribute("source", "laya-sql-like-placement");
  return { kind, confidence: placementAnswer.confidence, term: value };
}

// Scores the comparison via laya, scoped to just the operators legal for
// the already-selected field's type (a flat 8-way kind choice across all
// types scored 63% in earlier testing; type-scoped scored 86%). Whether
// there's a filter at all is resolved by field type ("self" -> "mine"), by the
// LIKE-family value extraction finding nothing (-> "all"), or by the
// downstream no-filter/resolve-value safety nets - not by a single call
// choosing among all 8 kinds blind to field. This makes kind depend on
// field, so the two can no longer run in parallel (see pipeline.ts).
export async function decideKindViaLaya(
  ctx: StageContext,
  entity: EntityName,
  fieldType: FieldType,
  field: string,
  query: string,
  sqlPrefix: string = `SELECT * FROM ${entity} WHERE `,
  excludeValues: ReadonlySet<string> = new Set(),
): Promise<KindDecision> {
  return withSpan(ctx, "kind.decide", async ({ setAttribute, ctx: childCtx }) => {
    if (fieldType === "self") {
      setAttribute("kind", "mine");
      setAttribute("confidence", 1);
      setAttribute("source", "field-type");
      return { kind: "mine" as Kind, confidence: 1 };
    }

    const allowed = KINDS_BY_TYPE[fieldType];
    if (allowed.length <= 1) {
      const kind = allowed[0]!;
      setAttribute("kind", kind);
      setAttribute("confidence", 1);
      setAttribute("source", "field-type");
      return { kind, confidence: 1 };
    }

    if (LIKE_FAMILY_TYPES.has(fieldType)) {
      return decideLikeFamilyKind(childCtx, sqlPrefix, entity, field, allowed, query, setAttribute);
    }

    // number/date: eq vs gt vs lt - a real comparison-operator choice
    // between distinct SQL operators, not a text-pattern one. Asking this
    // blind (just "field ") scored near-random even on clean queries -
    // eq/gt/lt off a bare operator symbol has nothing to anchor to. Tested
    // live: grounding the choice in the actual candidate value ("field >
    // 500" vs "field < 500" vs "field = 500") turned a 0.015-confidence
    // 3-way coinflip into a 0.71-confidence clean win, on the exact same
    // query. excludeValues (a range's earlier condition) picks which
    // candidate to ground with when more than one number/date is present.
    const candidates = tryDeterministicTerms(query, fieldType);
    const remaining = candidates.filter((c) => !excludeValues.has(c));
    const groundingValue = (remaining.length > 0 ? remaining : candidates)[0];

    const criteria: Record<string, string> = {};
    const literalToKind = new Map<string, Kind>();
    for (const candidate of allowed) {
      const operator = COMPARISON_OPERATOR[candidate] ?? candidate;
      const key = groundingValue ? `${operator} ${groundingValue}` : operator;
      criteria[key] = KIND_DESCRIPTIONS[candidate];
      literalToKind.set(key, candidate);
    }
    const sql = `${sqlPrefix}${field} `;
    const instructions = `Given the SQL built so far for this query, what kind of comparison is being requested on "${field}"?`;
    const answer = await layaChoiceSpan(childCtx, query, sql, instructions, criteria);
    const kind = literalToKind.get(answer.choice) ?? (answer.choice as Kind);

    setAttribute("kind", kind);
    setAttribute("confidence", answer.confidence);
    setAttribute("source", groundingValue ? "laya-grounded" : "laya");
    // Already extracted as a side effect of grounding the choice - reuse
    // it instead of a second, redundant resolveValue() call downstream.
    return groundingValue ? { kind, confidence: answer.confidence, term: groundingValue } : { kind, confidence: answer.confidence };
  });
}

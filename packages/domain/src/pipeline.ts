import { Trace, type OtlpSpan } from "@query-classifier/telemetry";
import { detectEntity } from "./entity/detect-entity";
import { selectField, type FieldSelection } from "./field/select-field";
import { decideKindViaLaya } from "./kind/decide-kind-laya";
import { decideContinuation } from "./kind/decide-continuation-laya";
import { extractFieldConditions } from "./kind/extract-field-conditions";
import { isNoFilter } from "./no-filter/is-no-filter";
import { resolveValue } from "./value/resolve-value";
import { extractLimit } from "./limit/extract-limit";
import { renderConditionSql } from "./render-condition-sql";
import type { StageContext } from "./context";
import {
  DEFAULT_DOMAIN,
  DOMAINS,
  TERM_FREE_KINDS,
  type Combinator,
  type ClassifyResult,
  type DomainName,
  type EntityName,
  type FieldType,
  type FilterCondition,
  type OutOfScopeResult,
} from "./schema";

// Fields whose conditions are extracted in one shot via the local LLM
// (kind/extract-field-conditions.ts), including a same-field range if
// present - see that module's doc comment for why. Every other type keeps
// going through decideKindViaLaya below.
const RANGE_CAPABLE_TYPES: ReadonlySet<FieldType> = new Set(["number", "date"]);

export interface ClassifyOutcome {
  result: ClassifyResult | OutOfScopeResult;
  trace: Trace;
}

async function decideConditionFromField(
  ctx: StageContext,
  entity: EntityName,
  query: string,
  fieldResult: FieldSelection,
  sqlPrefix: string,
  usedValuesByField: Map<string, Set<string>>,
): Promise<FilterCondition[]> {
  if (RANGE_CAPABLE_TYPES.has(fieldResult.type)) {
    const extracted = await extractFieldConditions(ctx, entity, fieldResult.field, fieldResult.type as "number" | "date", query);
    if (extracted.length === 0) {
      return [{ field: fieldResult.field, kind: "all", terms: [], type: fieldResult.type }];
    }
    return extracted.map((e) => ({ field: fieldResult.field, kind: e.kind, terms: [e.value], type: fieldResult.type }));
  }

  const excludeValues = usedValuesByField.get(fieldResult.field) ?? new Set<string>();
  const kindVote = await decideKindViaLaya(ctx, entity, fieldResult.type, fieldResult.field, query, sqlPrefix, excludeValues);

  let kind = kindVote.kind;
  // decideKindViaLaya's LIKE-placement stage already extracted the value
  // as a side effect of picking prefix/suffix/substring - reuse it instead
  // of asking narrateValue to find the same text again.
  let terms: string[] = kindVote.term ? [kindVote.term] : [];

  if (!TERM_FREE_KINDS.has(kind) && terms.length === 0) {
    // The no-filter check is only genuinely ambiguous for free-text
    // ("string") fields, where "items" vs. "items named ..." really does
    // need judgment. Every other field type has an unambiguous,
    // deterministic value shape (email/date/number/id regex, or a fixed
    // boolean convention - see value/deterministic-term.ts), so whether a
    // value is present is answered by looking, not by asking laya's noul
    // gate to guess.
    const noFilter = fieldResult.type === "string" && (await isNoFilter(ctx, entity, fieldResult.field, query));
    if (noFilter) {
      kind = "all";
    } else {
      terms = await resolveValue(ctx, entity, fieldResult.field, fieldResult.type, kind, query, sqlPrefix, excludeValues);
      if (terms.length === 0) {
        // Value resolution found nothing real - safer to fall back to
        // "all" than to ship a filter with no value.
        kind = "all";
      }
    }
  }

  return [{ field: fieldResult.field, kind, terms, type: fieldResult.type }];
}

async function buildCondition(
  ctx: StageContext,
  entity: EntityName,
  query: string,
  excludeFields: ReadonlySet<string>,
  sqlPrefix: string,
  usedValuesByField: Map<string, Set<string>>,
): Promise<FilterCondition[]> {
  const fieldResult = await selectField(ctx, entity, query, excludeFields, sqlPrefix);
  return decideConditionFromField(ctx, entity, query, fieldResult, sqlPrefix, usedValuesByField);
}

function recordUsedValues(usedValuesByField: Map<string, Set<string>>, field: string, terms: string[]): void {
  const set = usedValuesByField.get(field) ?? new Set<string>();
  for (const term of terms) set.add(term);
  usedValuesByField.set(field, set);
}

// The literal SQL built so far, ending right after the last value (no
// trailing WHERE/AND/OR) - used both to ask "does this continue?" and, if
// so, as the prefix the next condition's field/kind laya calls see, so
// they're grounded in the real accumulated clause instead of restarting
// from "SELECT * FROM entity WHERE" every time.
function renderSqlSoFar(entity: EntityName, filters: FilterCondition[], combinators: Combinator[]): string {
  const where = filters.map((f, i) => (i === 0 ? renderConditionSql(f) : `${combinators[i - 1]!.toUpperCase()} ${renderConditionSql(f)}`)).join(" ");
  return `SELECT * FROM ${entity} WHERE ${where}`;
}

// One classify() call = one Trace, one root span, every stage below nests
// under it. Kind is decided via laya, scoped to the selected field's own
// legal comparison operators (kind/decide-kind-laya.ts), so kind depends
// on field and the two run sequentially rather than in parallel.
export async function classify(
  query: string,
  domainName: DomainName = DEFAULT_DOMAIN,
  onSpanEnd?: (span: OtlpSpan) => void,
): Promise<ClassifyOutcome> {
  const domain = DOMAINS[domainName];
  const trace = new Trace(onSpanEnd);
  const root = trace.startSpan("classify");
  const ctx: StageContext = { trace, parentSpanId: root.spanId, domain };

  try {
    const entityResult = await detectEntity(ctx, query);
    if (!entityResult.inScope) {
      root.setAttribute("inScope", false).setAttribute("reason", entityResult.reason);
      root.end("ok");
      const message =
        entityResult.reason === "unclear"
          ? `I can't tell what this query is asking for - it doesn't clearly map to searching ${domain.entityListLabel}.`
          : `This doesn't look related to searching ${domain.entityListLabel} - I can't produce a structured query for it.`;
      return { result: { inScope: false, reason: entityResult.reason, message }, trace };
    }
    const { entity } = entityResult;

    const usedFields = new Set<string>();
    const firstSqlPrefix = `SELECT * FROM ${entity} WHERE `;
    const [firstFieldResult, limit] = await Promise.all([
      selectField(ctx, entity, query, usedFields, firstSqlPrefix),
      extractLimit(ctx, query),
    ]);

    const usedValuesByField = new Map<string, Set<string>>();
    const firstConditions = await decideConditionFromField(ctx, entity, query, firstFieldResult, firstSqlPrefix, usedValuesByField);
    for (const c of firstConditions) recordUsedValues(usedValuesByField, c.field, c.terms);
    const filters: FilterCondition[] = [...firstConditions];
    // A field that came back with 2+ conditions (a same-field range, from
    // extractFieldConditions) is always AND'd together - that's not a
    // guess, it's a structural fact about a range, so no laya call needed.
    const combinators: Combinator[] = filters.slice(1).map(() => "and" as Combinator);
    const availableFieldCount = Object.keys(domain.schema[entity]!).length;
    // Allows exactly one same-field repeat (a range) beyond the number of
    // distinct fields the entity has, without letting the chain run away.
    const maxConditions = availableFieldCount + 1;

    if (filters[filters.length - 1]!.kind !== "all") {
      for (const c of filters) usedFields.add(c.field);

      while (filters.length < maxConditions) {
        const sqlSoFar = renderSqlSoFar(entity, filters, combinators);
        const continuation = await decideContinuation(ctx, sqlSoFar, query);
        if (continuation.action === "end") break;

        const nextSqlPrefix = `${sqlSoFar} ${continuation.action.toUpperCase()} `;
        const nextConditions = await buildCondition(ctx, entity, query, usedFields, nextSqlPrefix, usedValuesByField);
        if (nextConditions[0]!.kind === "all") {
          // The continuation call said AND/OR, but nothing real was found
          // for a next condition - treat as a false positive and stop,
          // rather than appending a dangling filter-less condition.
          break;
        }
        filters.push(...nextConditions);
        for (const c of nextConditions) recordUsedValues(usedValuesByField, c.field, c.terms);
        combinators.push(continuation.action, ...nextConditions.slice(1).map(() => "and" as Combinator));
        for (const c of nextConditions) usedFields.add(c.field);
      }
    }

    root.setAttribute("inScope", true);
    root.setAttribute("entity", entity);
    root.setAttribute("conditionCount", filters.length);
    root.setAttribute("kind", filters.map((f) => f.kind).join(","));
    root.end("ok");

    return {
      result: {
        entity,
        filters,
        combinators,
        pagination: { limit: limit ?? 10 },
      },
      trace,
    };
  } catch (err) {
    root.end("error", err instanceof Error ? err.message : String(err));
    throw err;
  }
}

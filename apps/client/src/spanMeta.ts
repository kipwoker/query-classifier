// Every laya call is wrapped in a span literally named "laya.*" (via
// util/laya-choice-span.ts, plus entity/detect-entity.ts's two variants);
// every local-LLM call is wrapped as "llm.*" (value/narrate-value.ts,
// kind/extract-field-conditions.ts). Stage/orchestration spans (the ones
// that decide WHICH backend to call, not call one themselves) use neither
// prefix - see packages/domain/src/*/*.ts's withSpan() call sites.
export type Backend = "laya" | "llm" | null;

export function spanBackend(name: string): Backend {
  if (name.startsWith("laya.")) return "laya";
  if (name.startsWith("llm.")) return "llm";
  return null;
}

const PHASE_LABELS: Record<string, string> = {
  classify: "Starting",
  "entity.detect": "Detecting entity",
  "field.select": "Selecting field",
  "limit.extract": "Extracting result limit",
  "kind.decide": "Deciding comparison type",
  "llm.extractFieldConditions": "Extracting conditions with the LLM",
  "llm.narrateValue": "Extracting value with the LLM",
  "noFilter.check": "Checking whether a filter applies",
  "value.resolve": "Resolving filter value",
  "kind.decideContinuation": "Checking for more conditions",
  "kind.decideContinuation.complete": "Checking for more conditions",
  "kind.decideContinuation.combinator": "Deciding AND / OR",
};

export function phaseLabel(name: string): string {
  if (PHASE_LABELS[name]) return PHASE_LABELS[name];
  const backend = spanBackend(name);
  if (backend === "laya") return "Consulting laya";
  if (backend === "llm") return "Asking the LLM";
  return "Processing";
}

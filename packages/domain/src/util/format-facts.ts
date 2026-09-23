// Label prior-stage outputs explicitly as fixed facts rather than bare
// key=value tokens - a weak model is more likely to treat "entity=track"
// as just another word in the prompt than as a constraint it must respect.
export function formatFacts(facts: Record<string, unknown>): string {
  const lines = Object.entries(facts).map(([k, v]) => `- ${k} = ${JSON.stringify(v)}`);
  return `Already determined for this query - treat these as fixed, do not change them:\n${lines.join("\n")}`;
}

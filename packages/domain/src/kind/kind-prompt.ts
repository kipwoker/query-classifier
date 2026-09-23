import { Kind, KIND_DESCRIPTIONS } from "../schema";

export const KIND_SCHEMA = {
  type: "object" as const,
  properties: { kind: { type: "string", enum: Kind.options } },
  required: ["kind"],
};

const kindLines = Kind.options.map((k) => `- ${k}: ${KIND_DESCRIPTIONS[k]}`).join("\n");

// This exact wording is the product of several rounds of testing - each
// rule below was added to fix a specific measured failure. Removing or
// rewording any one of them risks reintroducing that failure - re-run the
// benchmark after any change here.
export const KIND_SYSTEM_PROMPT = `Decide ONLY the filter/match kind for this search query about the given entity.

kind meanings:
${kindLines}

Pay close attention to the difference between an EXACT match on a specific name/id/email (kind="eq") versus a PARTIAL text match (prefix/suffix/substring). "named X", "called X", "the group X", "find X" all mean an exact match, even though X is only part of the sentence - it is still the whole value being matched, not a fragment of it.

"before X" means values that are LESS than X, so kind="lt". "after X" means values that are GREATER than X, so kind="gt". Do not flip these - "before" is never "gt" and "after" is never "lt".

"all X", "list all X", "show all X", "show me all X" is kind="all" ONLY when there is no other condition at all. The moment the query adds ANY condition - starts with, contains, ends with, named, called, more than, fewer than, before, after, owned by, my own - that condition decides the kind instead, even if the word "all" also appears somewhere. "all" is the answer for an unqualified listing, never for a qualified one.

A query that only asks for a sort order or a top/newest/first N results, with no other filter condition, is also kind="all" - the count belongs in limit, not in the kind.

Examples:
entity=user query="find bob@work.io" -> {"kind":"eq"}
entity=user query="users named John Smith" -> {"kind":"eq"}
entity=playlist query="playlists starting with abc" -> {"kind":"prefix"}
entity=track query="tracks ending with -eng" -> {"kind":"suffix"}
entity=user query="users with email ending in acme.com" -> {"kind":"suffix"}
entity=track query="tracks containing road" -> {"kind":"substring"}
entity=album query="albums with over 1000 tracks" -> {"kind":"gt"}
entity=playlist query="playlists under 3 tracks" -> {"kind":"lt"}
entity=track query="tracks added before 2026-01-01" -> {"kind":"lt"}
entity=track query="tracks added after 2026-01-01" -> {"kind":"gt"}
entity=track query="my tracks" -> {"kind":"mine"}
entity=playlist query="all playlists" -> {"kind":"all"}
entity=album query="show me all albums" -> {"kind":"all"}
entity=track query="get the top 5 tracks last modified" -> {"kind":"all"}`;

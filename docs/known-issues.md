# Known open issues

Not yet fixed. Read before changing pipeline code — several of these constrain what edits are safe.

## Kind-decision ceiling (~86%)

The `eq` vs `substring`/`suffix` boundary and the `gt`/`lt` direction on some phrasings sit at a
genuine ~86% ceiling for the kind-decision LLM call.

- Not a bug — a measured model limitation.
- Adding operator options made it worse, not better ([laya guidelines](laya-guidelines.md), rule 5).

## No-filter stage can inherit a wrong field

`domain/src/no-filter/is-no-filter.ts` can inherit a wrong field from the field-selection stage
and silently produce `kind=all` instead of surfacing a field error.

- The benchmark report flags these as "compounding failures" when detected.

## Range extractor hallucinates off-by-one values

`kind/extract-field-conditions.ts` (the ollama-based range extractor) can hallucinate an
off-by-one value on some phrasings.

- Confirmed on the `music` domain: "more than 50 tracks" extracted `51`; "more than 20 tracks"
  extracted `21` — the latter also spawned 2 spurious extra conditions.
- Not reproduced on `shop`/other domains with similar phrasing ("more than 500 users",
  "cost more than 20") — domain/field-specific trigger, not yet isolated.
- This is exactly the kind of thing multi-domain testing is for.

## Clarification is not wired into the default pipeline

`domain/src/clarification/` is implemented but disabled by default.

- No confidence threshold tested so far reliably separates real ambiguity from
  correct-but-low-confidence answers.
- Related: laya confidence is not calibrated for absolute thresholds
  ([laya guidelines](laya-guidelines.md), rule 6).

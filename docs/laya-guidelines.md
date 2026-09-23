# Laya usage guidelines

Golden rules learned the hard way across this project's sessions. Read this before touching any
`layaChoice`/`layaNoul` call in `packages/domain/src/`.

## What laya actually is

Laya (see https://github.com/NandhaKishorM/laya) is **not a generative LLM**. It's a
ModernBERT-large encoder classifier (~421M params) running a single non-autoregressive forward
pass (~33ms). No text generation, no chain-of-thought, no iterative reasoning - it produces a
structured typed prediction directly from one pass over the input. Every rule below follows from
this.

## Rule 1: ask concrete content questions, never self-referential meta questions

Laya is good at direct content matching (which entity/field/operator/value matches this text) -
that's a classification task, which is what an encoder is trained for. It is consistently bad at
abstract judgments *about* the input, no matter how the question is worded:

- "does this have a filter?" (self-referential) scored 42% vs. content-statement framing at 89%.
- "is this query ambiguous relative to this schema?" scored as noise across 4 different wordings
  (SQL-framed, pre-SQL, key renamed to `message`, backtick-referenced keys) - always near-uniform,
  never separating real ambiguity from clear cases.
- "does this WHERE clause fully capture the request?" (`isFilterComplete`) climbs almost
  monotonically with SQL length, nearly independent of whether the query is actually covered -
  confirmed with a bare field name (no operator, no value) scoring "complete" at 0.85.

If you're asking "is X sufficient/complete/ambiguous/enough" - stop. That's not a task shape this
model can do, and no rewording fixes it (verified: renaming the state key, avoiding "query"/"request"
ambiguity, referencing field names in backticks - none of it moved the needle). Reframe as a
concrete content fact instead, or don't ask laya at all.

## Rule 2: content-statement pairs beat self-referential yes/no for existence checks

When you do need an "is there a value / is there a filter" existence check, use two competing
CONTENT statements scored via `noul`, never a single self-referential question:

```
// good - two concrete statements
"Does this match: '{entity}s where {field} is unspecified'?"
"Does this match: '{entity}s where {field} has a specific value'?"

// bad - self-referential meta-question
"Does this query specify a filter?"
```

This is `no-filter/is-no-filter.ts`'s pattern (89% isolated) - the one existence-check shape that
has reliably worked.

## Rule 3: use real, literal domain tokens as criteria keys, not internal abstractions

Laya responds far better to tokens it's plausibly seen in real text than to our own internal enum
labels:

```
// good
{ "=": "...", "LIKE": "..." }
{ "=": "...", ">": "...", "<": "..." }

// bad
{ eq: "...", prefix: "...", suffix: "...", substring: "..." }
{ eq: "...", gt: "...", lt: "..." }
```

Switching `eq`/`gt`/`lt` symbol keys alone fixed a real "before X" -> `lt` misfire (was `eq=0.47`
vs `lt=0.34`; became `<` winning outright). This generalizes - anywhere the domain has a literal
token (SQL operator, real punctuation), prefer it over our own naming.

## Rule 4: ground abstract choices in concrete values when you can

Asking for an operator blind (`field` with nothing after it) scored near-random even on clean
queries - `eq`/`gt`/`lt` off a bare symbol has nothing to anchor to. Grounding the choice in the
actual candidate value turned a 0.015-confidence 3-way coinflip into a 0.71-confidence clean win,
on the exact same query:

```
// blind - confidence ~0.015, near coinflip
{ "=": "...", ">": "...", "<": "..." }

// grounded - confidence ~0.28-0.75, decisive
{ "= 500": "...", "> 500": "...", "< 500": "..." }
```

## Rule 5: narrow the option set - split high-cardinality/compound questions

This is laya's own documented guidance for high-cardinality problems ("raise `head_max_len`, use
embedding-based shortlisting, or split into coarse/fine questions") - and it matches this
project's biggest wins independently discovered before reading the docs:

- `field.select`: scoped to just the entity's own fields (~4 options) instead of a flat 9-field
  enum across all entities - 89% vs. 53%.
- `kind.decide`: scoped to just the operators legal for the field's type (2-4 options) instead of
  all 8 kinds - 86% vs. 63%.
- A field blending two mutually-exclusive ownership concepts ("mine" vs. "someone else's,
  identified by a specific value") split into two atomic criteria instead of one blended
  "or" criterion.
- `decide-continuation-laya.ts`: one 3-way `;`/`AND`/`OR` choice (noisy, 0.02-0.06 confidence,
  drove false-positive condition chains) replaced with two sequential binary questions
  (complete/incomplete, then AND/OR only if incomplete).

Adding options is the opposite lever and reliably makes things worse, even when the extra options
seem semantically reasonable: adding `>=`/`<=` alongside `=`/`>`/`<` made every tested case worse,
not better (it diluted the signal and flipped previously-correct answers).

## Rule 6: confidence is not calibrated - don't use it as an absolute threshold

Documented by laya itself: "Both checkpoints are over-confident as shipped... needs temperature
fitting for reliable confidence-based gating." Use the returned `confidence`/`probabilities` only
for *relative* comparison between options in one call, never as an absolute go/no-go cutoff across
different question types or deployments.

## Rule 7: don't blindly shorten prompts - validate every wording change individually

`head_max_len` gives each criteria option a small, fixed token budget, so verbose descriptions
risk silent truncation - that part is real and worth caring about. But **do not do a batch
shortening pass and trust it because it typechecks and "looks redundant."** A full trim-everything
pass on this project dropped the benchmark from 17/19 to 12-14/19, and the exact fragments doing
real work were not the ones a human would guess:

- Dropping "begins with" when "starts with" was already said: fine.
- Dropping the second "match" in "an exact match or a partial text match": broke email
  suffix/eq disambiguation.
- Dropping "being requested" from "what kind of comparison is being requested on X": contributed
  to the same regression class.
- Shortening `ENTITY_DESCRIPTIONS` for two entities whose names are lexically close: broke
  disambiguation between them on a query that literally contained one entity's own name as
  a word - the longer description apparently carried disambiguating signal beyond the name
  itself, and trimming it removed exactly that.
- Removing "Given the SQL built so far for this query" as a preamble (treating it as filler):
  this phrase invokes the project's own validated SQL-framing technique explicitly in the
  instructions text, not just in `state.sql` - for a non-generative classifier that does direct
  content-matching over the whole input, repeating "SQL" in the instructions may be doing real
  semantic-anchoring work, not just spending tokens.

If you want to shorten a prompt: change one thing, run the benchmark 2-3 times (there's a
documented ±2-3 case noise band even with zero code changes), and only keep
the change if it's stable outside that band. Don't change five things and check once.

## Playground scripts

- `bun run experiment:laya-kind` - `packages/domain/src/kind/laya-kind-experiment.ts`
- `bun run experiment:laya-completeness` - `packages/domain/src/kind/laya-completeness-experiment.ts`

Both hit the live laya service directly, isolated from the pipeline - use them to test wording
changes before touching real code.

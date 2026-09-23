# Benchmark report - {{timestamp}}

## Summary

- Accuracy: {{passedCases}}/{{totalCases}} ({{accuracyPct}}%)
- Total duration: {{totalDurationMs}}ms ({{avgDurationMs}}ms/query avg)
- Compared to previous run ({{previousTimestamp}}): {{diffSummary}}

## Per-field accuracy

| Field | Accuracy |
|---|---|
{{perFieldTable}}

## Per-case results

| Query | Pass | Entity | Kind | Field | Terms | Conditions | Limit | Duration | Trace |
|---|---|---|---|---|---|---|---|---|---|
{{casesTable}}

## Known compounding failures (no-filter gate inheriting a field-selection error)

{{compoundingNotes}}

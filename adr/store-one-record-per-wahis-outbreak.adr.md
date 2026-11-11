# Store one record per WAHIS outbreak, latest validated report wins

## Status

Proposed

## Context

WAHIS organises data as event → report → outbreak. Each report is a snapshot of the whole event as at that report. It repeats outbreaks carried over from earlier reports, with updated cumulative counts and dates. `outbreakId` stays the same across an event's reports. Most uses of the data, such as counts, maps and classification, are about outbreaks, not reports. If every report's version were stored, consumers would have to dedupe them, and summing `totals` across reports would double count.

## Decision

We store one document per outbreak in the WAHIS outbreak collection, with a unique index on `source.outbreakId`. The transform upserts each outbreak from the newest validated report that includes it: the highest `reportNumber`, then a later `reportedOn`, then a later fetch date. It skips non-validated reports, and compares against the stored record before replacing it. It replaces the whole document and never mixes fields from different reports. We keep every report's raw response in S3 as the history. We validate documents with `src/data/schemas/wahis-outbreak.schema.json` (schema version 2.0.0).

## Consequences

- Consumers read one current record per outbreak, with cumulative `totals` that are correct as at the latest report.
- Per-report deltas (`newQuantities`) aren't on the record. "New this period" numbers come from report-level `news`, or from an `outbreak_versions` collection if we add one later.
- Reprocessing is idempotent: transforming reports in any order gives the same records.
- A draft or unvalidated report can't overwrite a validated one, because the schema only accepts `reportStatus: Validated`.
- Getting `firstReportedOn` for carried-over outbreaks needs the creating report, which is one extra fetch per event chain. Until then it's null.

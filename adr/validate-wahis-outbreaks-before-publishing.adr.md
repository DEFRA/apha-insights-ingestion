# Validate WAHIS outbreak records before publishing them

## Status

Proposed. Parked while the WAHIS transform is a spike.

## Context

The transform maps WAHIS reports to outbreak records and writes them to S3. The backend (`apha-risk-insights-backend`) will load them into MongoDB after it receives an SQS event. The backend owns the deployed database.

Today the transform does not check its own output. It checks only that the source report has status `Validated`, which is WAHIS's check, not ours. The mapper sets `validationStatus: 'valid'` on every record without checking it. A mapper bug would only show up when the backend's MongoDB validator rejects the record, with a code `121` error that is hard to trace back to the transform.

The outbreak schema started here as a MongoDB `$jsonSchema` validator. It uses `bsonType`, and it requires `_id` as an `objectId`. A JSON Schema validator such as `ajv` cannot evaluate it as written, and a record bound for S3 has no `_id`. Each record already carries `processing.schemaVersion` (currently `2.0.0`).

See also `store-one-record-per-wahis-outbreak.adr.md`, and `validate-with-mongo-jsonschema-only.adr.md` in the backend repo.

## Decision

We own the WAHIS outbreak schema in this repo and treat it as the contract with the backend. We version it with semantic versioning and bump the version on every change.

We keep the schema as a standard JSON Schema (draft 2020-12) in `src/data/schemas/wahis-outbreak.schema.json`, describing the record as written to S3 (no `_id`). We validate each transformed record against it with `ajv` before writing it to S3. The MongoDB `$jsonSchema` version moves to the backend, which owns the collection. A record that fails goes into `failed` with the field path and the rule that broke, and we do not write it. The mapper sets `validationStatus` from the result of that check.

We put the schema version in the SQS message that tells the backend new records are ready, so the backend can reject a version it does not support before it reads from S3.

## Consequences

- Mapper bugs fail in the transform, with readable errors, instead of in the backend.
- The backend still validates on load (see the backend ADR). The check runs twice, which is deliberate: the backend should not trust whatever is in S3.
- `ajv` is a new dependency. Its errors give the field path and the rule, for example `/geography/point/coordinates/1 must be <= 90`.
- There are two schema files in two formats: JSON Schema here, `$jsonSchema` in the backend. They are kept in step by hand. A schema change needs both files updated and the version bumped. Generating the `$jsonSchema` from the JSON Schema would remove that, and is a follow-up.
- Records with the new version cannot be loaded until the backend has the matching `$jsonSchema`.
- Follow-up: define the SQS message shape, and decide what happens to failed records in the "latest validated report wins" comparison.

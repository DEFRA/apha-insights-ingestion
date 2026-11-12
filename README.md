# apha-insights-ingestion

Gathers animal disease data from external sources, transforms it into a
consistent format, and saves it to S3 for
[APHA Risk Insights](https://github.com/DEFRA/apha-risk-insights-frontend) to
use.

It is part of the **APHA Incubator** project and runs on the Defra
[Core Delivery Platform (CDP)](https://portal.cdp-int.defra.cloud/).

> [!WARNING]
> **This service only supports a spike. It is not production ready.**
> It does not ingest data automatically. Raw data is uploaded by hand and the
> transform is run by hand from an npm script against a local S3 emulator.
> Nothing is scheduled, and no other service reads its output yet.

- [Purpose](#purpose)
  - [Current state](#current-state)
  - [Future scope](#future-scope)
- [Related services](#related-services)
- [How it works](#how-it-works)
  - [Storage layout](#storage-layout)
  - [Transform WAHIS data (spike)](#transform-wahis-data-spike)
  - [Spike caveats](#spike-caveats)
- [Requirements](#requirements)
- [Running locally](#running-locally)
  - [With apha-incubator-core (all services)](#with-apha-incubator-core-all-services)
  - [Standalone](#standalone)
  - [Browsing local S3](#browsing-local-s3)
  - [Ports](#ports)
- [Environment variables](#environment-variables)
- [Running on CDP](#running-on-cdp)
- [Development](#development)
  - [Git hooks](#git-hooks)
  - [Testing](#testing)
  - [Npm scripts](#npm-scripts)
  - [Docker Compose files](#docker-compose-files)
  - [Architecture decisions](#architecture-decisions)
  - [MongoDB locks](#mongodb-locks)
  - [Update dependencies](#update-dependencies)
  - [Windows prettier issue](#windows-prettier-issue)
- [API endpoints](#api-endpoints)
- [Licence](#licence)

## Purpose

APHA Risk Insights helps APHA assess animal disease risk. That needs data from
several external sources, each with its own API, format and quirks. This
service is where that data comes in. It:

1. **Gathers** raw responses from a source and stores them unchanged in S3, so
   they can always be reprocessed.
2. **Transforms** them into a consistent, validated record format.
3. **Saves** the transformed records to S3 for downstream services.

### Current state

The first source is [WAHIS](https://wahis.woah.org/), the World Organisation
for Animal Health (WOAH) animal disease information system. The spike covers
highly pathogenic avian influenza (HPAI) outbreaks only.

| Step      | Status                                                                     |
| --------- | -------------------------------------------------------------------------- |
| Gather    | Manual. A sample of WAHIS responses (11 events) is uploaded to S3 by hand. |
| Transform | Spike. `npm run transform:wahis`, run by hand.                             |
| Save      | Local S3 (floci) only.                                                     |
| Schedule  | None. Nothing runs automatically.                                          |
| Consumers | None yet.                                                                  |

The Hapi API runs and connects to MongoDB, but only exposes `/health`. The
transform does not use MongoDB yet.

### Future scope

- Fetch data from WAHIS automatically, on a schedule, rather than by hand.
- Add more data sources, each with its own raw prefix and transform.
- Load transformed records into MongoDB (the outbreak schema in
  `src/data/schemas/` is already a MongoDB `$jsonSchema` validator) and/or
  expose them for `apha-risk-insights-backend` to use.
- Agree the record schema and classification rules with the people who use
  the data. See the open questions in
  [`src/data/schemas/README.md`](./src/data/schemas/README.md#open-questions).

## Related services

All services run together locally through `apha-incubator-core`.

| Repo                                                                                | Role                                                                            | Local URL             |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | --------------------- |
| [apha-incubator-core](https://github.com/DEFRA/apha-incubator-core)                 | Developer toolkit. Clones, updates and runs every service together.             | n/a                   |
| [apha-risk-insights-frontend](https://github.com/DEFRA/apha-risk-insights-frontend) | User-facing web app.                                                            | http://localhost:3000 |
| [apha-risk-insights-backend](https://github.com/DEFRA/apha-risk-insights-backend)   | API for the frontend.                                                           | http://localhost:3001 |
| **apha-insights-ingestion** (this repo)                                             | Gathers, transforms and stores source data.                                     | http://localhost:3002 |
| [wahis-openapi](https://github.com/DEFRA/wahis-openapi)                             | OpenAPI description of the WAHIS public API, and the workflows used to call it. | n/a                   |

## How it works

```text
WAHIS public API ──(manual fetch + upload)──▶ S3 raw/wahis/{date}/...
                                                   │
                                     npm run transform:wahis
                                                   │
                                                   ▼
                              S3 transformed/wahis-outbreak/outbreak_id={id}.json
```

| Path                                        | Role                                                       |
| ------------------------------------------- | ---------------------------------------------------------- |
| `scripts/transform-wahis.js`                | CLI entry point. Parses flags, runs the service.           |
| `src/services/transform-wahis-outbreaks.js` | Lists raw keys, picks the latest version, writes output.   |
| `src/mappers/wahis-outbreak.js`             | Maps one raw WAHIS outbreak to a v2 outbreak record.       |
| `src/common/helpers/s3-client.js`           | S3 read/list/write helpers bound to one bucket.            |
| `src/data/schemas/`                         | Outbreak record schema, example, and model notes.          |
| `fixtures/`                                 | Sample WAHIS responses used by the tests (see its README). |

### Storage layout

The service uses a single S3 bucket (`apha-insights-ingestion-local`
locally). Key prefixes separate the data:

```text
raw/wahis/{date}/event-filtered-list.json
raw/wahis/{date}/reports/{reportId}/report.json
raw/wahis/{date}/reports/{reportId}/outbreaks/{outbreakId}.json
transformed/wahis-outbreak/outbreak_id={outbreakId}.json   <- output
```

`{date}` is the date the raw data was fetched. Raw data is never modified,
so every version of an outbreak stays available for reprocessing.

This repo owns the bucket: `compose/floci/start.d/10-setup-resources.sh` is the
only place it is defined. The standalone stack runs that script on its own
floci, which keeps no data between restarts. `apha-incubator-core` mounts the
same script into its shared floci and runs it on startup, without defining any
resources itself. The shared floci does persist data, so the script skips
buckets that already exist.

### Transform WAHIS data (spike)

`npm run transform:wahis` reads raw WAHIS responses from the bucket and writes
one v2 outbreak record per outbreak (see
[`src/data/schemas/`](./src/data/schemas/README.md) and
[`adr/store-one-record-per-wahis-outbreak.adr.md`](./adr/store-one-record-per-wahis-outbreak.adr.md)).

Only validated reports are used; outbreaks from draft or other non-validated
reports are skipped. When several reports include an outbreak, the latest
report wins. If the same report was fetched on more than one date, the latest
fetch wins. The same rule is checked against the record already in the bucket,
so rerunning an older key never overwrites a newer record.

Before running it, start floci (see [Running locally](#running-locally)) and
upload the raw data under `raw/wahis/{date}/` using the layout above. Then:

```bash
export AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test
npm run transform:wahis -- --key raw/wahis/2026-11-09/reports/186838/outbreaks/198855.json --dry-run
npm run transform:wahis -- --limit 5
npm run transform:wahis                                         # everything
S3_ENDPOINT_URL=http://localhost:4567 npm run transform:wahis   # standalone floci
```

| Flag        | Effect                                                      |
| ----------- | ----------------------------------------------------------- |
| `--key`     | Transform one raw outbreak key.                             |
| `--limit`   | Transform the first _n_ raw outbreak keys.                  |
| `--dry-run` | Print the records that would be written, and write nothing. |

The script exits non-zero if any outbreak fails to transform or write.

To copy the output to a real AWS bucket, download it from floci, then upload
with your AWS credentials. Do not do this for anything beyond spike review
without agreeing the schema and data first:

```bash
aws --endpoint-url=http://localhost:4566 s3 sync s3://apha-insights-ingestion-local/transformed/ ./transformed/
aws s3 sync ./transformed/ s3://<dev-bucket>/transformed/
```

### Spike caveats

- It is a proof of concept. The transform rules, classification and output
  schema in `src/data/schemas/` may change without notice, and existing
  `transformed/` records may need regenerating.
- It only runs against local floci. Nothing is scheduled, deployed or
  connected to MongoDB, and no service reads the transformed output yet.
- The input is the hand-uploaded fixture sample (11 events), not the full
  WAHIS dataset, so the output does not represent real coverage.
- npm treats `--dry-run` as its own flag unless it follows `--`, so always
  write `npm run transform:wahis -- --dry-run`. Without the `--`, the script
  runs for real.
- Floci accepts any credentials. Put them in a gitignored `.env`, never in
  committed files.
- WAHIS data is WOAH's. See [`fixtures/NOTICE.md`](./fixtures/NOTICE.md) for
  the source, modifications and disclaimer before reusing it.

## Requirements

- [Node.js](http://nodejs.org/) `>= v24` and npm `>= v11`.
  ```bash
  nvm use
  ```

- [Docker Desktop](https://docs.docker.com/get-docker/) with Compose v2. MongoDB
  and floci (the AWS emulator) always run as containers, for the app and for
  tests.
- Optional: [stu](https://lusingander.github.io/stu/) to browse local S3, and
  [pre-commit](https://pre-commit.com/) for git hooks.

Install dependencies:

```bash
npm install
```

## Running locally

There are two ways to run the service. Use only one at a time: their containers
clash on the shared `apha-risk` network.

### With apha-incubator-core (all services)

Use this to run the whole of APHA Risk Insights together. Core clones every
service next to itself, and runs them with one shared floci on port `4566`:

```bash
git clone git@github.com:DEFRA/apha-incubator-core.git
cd apha-incubator-core
npm run setup
npm start
```

The ingestion API is then on http://localhost:3002, its MongoDB on
`localhost:27018`, and the shared floci on `localhost:4566`. The shared floci
keeps its data between restarts. See the
[apha-incubator-core README](https://github.com/DEFRA/apha-incubator-core#readme)
for its other commands.

### Standalone

Use this to work on this service on its own. It runs the API, MongoDB and floci
from this repo's Compose files:

```bash
npm run docker:up        # API + MongoDB + floci on 3002 / 27018 / 4567
npm run docker:debug     # same, with the Node inspector on 9231
npm run docker:stop      # stop (add :v to wipe MongoDB data)
```

The standalone floci is on port `4567` and keeps no data between restarts, so
re-upload raw data after each restart. Point scripts at it with
`S3_ENDPOINT_URL=http://localhost:4567`.

Mock AWS resources are created when floci starts, by the scripts in
`./compose/floci/start.d/`. MongoDB seed data can be added in `./compose/mongo/`.

### Browsing local S3

Install [stu](https://lusingander.github.io/stu/) (`brew install stu`) and run:

```bash
npm run local-s3                                         # shared floci from apha-incubator-core (4566)
S3_ENDPOINT_URL=http://localhost:4567 npm run local-s3   # this repo's standalone stack
npm run local-s3 -- --prefix raw/wahis/                  # extra args go to stu
```

### Ports

Host ports are offset from `apha-risk-insights-backend` so both stacks can run
side by side.

| Port    | What                                     |
| ------- | ---------------------------------------- |
| `3002`  | Ingestion API                            |
| `9231`  | Node inspector                           |
| `27018` | MongoDB                                  |
| `4567`  | floci (standalone)                       |
| `4566`  | floci (shared, from apha-incubator-core) |

## Environment variables

Config is defined in [`src/config.js`](./src/config.js). Locally, put
overrides in a gitignored `.env` file; `npm run dev`, `npm start` and
`npm run transform:wahis` load it if it exists.

| Variable                                      | Default                         | Notes                                                                                      |
| --------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------ |
| `PORT`                                        | `3002`                          |                                                                                            |
| `HOST`                                        | `0.0.0.0`                       |                                                                                            |
| `ENVIRONMENT`                                 | `local`                         | CDP environment name. Set by CDP.                                                          |
| `SERVICE_VERSION`                             | `null`                          | Set by CDP.                                                                                |
| `MONGO_URI`                                   | `mongodb://127.0.0.1:27017/`    | Compose sets `mongodb://mongodb:27017/`. Provided by CDP.                                  |
| `MONGO_DATABASE`                              | `apha-insights-ingestion`       |                                                                                            |
| `MONGO_RETRY_WRITES`, `MONGO_READ_PREFERENCE` | unset                           | Override the Mongo URI options.                                                            |
| `AWS_REGION`                                  | `eu-west-2`                     |                                                                                            |
| `S3_ENDPOINT_URL`                             | `http://localhost:4566`         | floci. Use `http://localhost:4567` for the standalone stack. Set it empty to use real AWS. |
| `S3_BUCKET`                                   | `apha-insights-ingestion-local` |                                                                                            |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`  | none                            | Needed by the AWS SDK. Any value works for floci (e.g. `test`). Never commit them.         |
| `LOG_ENABLED`, `LOG_LEVEL`, `LOG_FORMAT`      | on, `info`, `pino-pretty`       | `LOG_FORMAT` defaults to `ecs` in production.                                              |
| `HTTP_PROXY`                                  | `null`                          | See [Running on CDP](#running-on-cdp).                                                     |
| `TRACING_HEADER`                              | `x-cdp-request-id`              |                                                                                            |

A minimal local `.env` for the transform:

```bash
AWS_ACCESS_KEY_ID=test
AWS_SECRET_ACCESS_KEY=test
AWS_REGION=eu-west-2
S3_ENDPOINT_URL=http://localhost:4566
```

## Development

### Testing

Tests run in Docker against a real MongoDB container (see
[`adr/containerized-mongo-for-all-tests.adr.md`](./adr/containerized-mongo-for-all-tests.adr.md)).
The test stack runs under its own Compose project
(`apha-insights-ingestion-test`), so it can run alongside the dev stack
without clashing on ports, container names or data.

```bash
npm run docker:test         # one-shot run
npm run docker:test:watch   # watch mode
npm run check:all           # security audit, format check, lint and tests
```

### Npm scripts

Run `npm run` to list every script, or see [package.json](./package.json).

### Docker Compose files

- `compose.yaml`: base services (API, MongoDB, floci), no published ports.
- `compose.override.yaml`: host ports for dev. Auto-loaded by `docker compose up`.
- `compose.debug.yaml`: runs the service with the Node inspector attached.
- `compose.test.yaml`: runs the test suite in a dedicated container.
- `compose.test.watch.yaml`: runs the test suite in watch mode.

To build the image on its own:

```bash
docker build --no-cache --tag apha-insights-ingestion .
docker run -e PORT=3002 -p 3002:3002 apha-insights-ingestion
```

### Architecture decisions

Significant decisions are recorded in [`adr/`](./adr). Check there before
changing the data model, storage or test setup.

### MongoDB locks

Access MongoDB through `src/data/db.js`. If you need a write lock, acquire it
via `server.locker` or `request.locker`, and keep the locked work small and
atomic:

```javascript
async function doStuff(server) {
  await using lock = await server.locker.lock('unique-resource-name')

  if (!lock) {
    // Lock unavailable
    return
  }

  // do stuff; lock released automatically
}
```

Coverage reports do not handle `using`; call `await lock.free()` in a
`finally` block instead if that matters. Helpers are in
`src/common/helpers/mongo-lock.js`.

### Update dependencies

Use [npm-check-updates](https://github.com/raineorshine/npm-check-updates):

```bash
ncu --interactive --format group
```

## API endpoints

| Endpoint       | Description |
| :------------- | :---------- |
| `GET: /health` | Health      |

## Licence

THIS INFORMATION IS LICENSED UNDER THE CONDITIONS OF THE OPEN GOVERNMENT LICENCE found at:

<http://www.nationalarchives.gov.uk/doc/open-government-licence/version/3>

The following attribution statement MUST be cited in your products and applications when using this information.

> Contains public sector information licensed under the Open Government license v3

WAHIS data in `fixtures/` comes from WOAH. See
[`fixtures/NOTICE.md`](./fixtures/NOTICE.md) for its source, modifications
and disclaimer.

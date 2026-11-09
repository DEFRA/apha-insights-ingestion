# AGENTS.md

Instructions for AI agents working on apha-insights-ingestion.

## Service

- Hapi.js API, MongoDB, Node `type: module`
- Sibling repo for conventions: `apha-risk-insights-backend` (same family, same stack). Match its structure, Docker setup and npm scripts.
- All services run together locally through `apha-incubator-core`.

## Naming conventions

- Dev Compose project name: `apha-insights-ingestion`
- Test Compose project name: `apha-insights-ingestion-test` (always pass `-p` explicitly)
- Docker network: `apha-risk` (pinned, shared by dev and test, and with sibling services)
- Container names: `apha-insights-ingestion-development` (dev), `apha-insights-ingestion-test` (test)
- Mongo hostnames: `mongodb` (dev), `mongo-test` (test). The test project never starts a `mongodb` service, so `mongodb` on the shared network always means the dev database.
- Host ports: app `3002`, debugger `9231`, MongoDB `27018`, Floci `4567`. They are offset from `apha-risk-insights-backend` so both stacks can run at once. Keep them unique across the service family.

## Standing decisions — do not re-litigate

- Keep current `src/` layout (`common/helpers`, `plugins`, `routes`, `services`); add `data/`, `repos/`, `mappers/` only as needed.
- Only `floci` from the AWS stack. No `redis`.
- MongoDB always runs as a real container, for app and tests. No in-memory Mongo, ever.
- Access Mongo through `src/data/db.js`.
- Prettier stays. Husky removed. `.pre-commit-config.yaml` used instead.

## ADRs

Record significant, hard-to-reverse decisions (architecture, data model,
cross-cutting conventions, dependency choices, security boundaries,
error-handling strategy) in `adr/`.

- One file per decision: `adr/<kebab-case-verb-phrase>.adr.md`
- Sections in order: Status, Context, Decision (active voice), Consequences
- Check `adr/` first before writing a new one — update/reference existing, or
  supersede explicitly (mark old one `Status: Superseded`, cross-link).

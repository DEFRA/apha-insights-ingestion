# apha-insights-ingestion

Core delivery platform Node.js Backend Template.

- [Requirements](#requirements)
  - [Node.js](#nodejs)
- [Local development](#local-development)
  - [Setup](#setup)
  - [Development](#development)
  - [Testing](#testing)
  - [Production](#production)
  - [Npm scripts](#npm-scripts)
  - [Update dependencies](#update-dependencies)
  - [Formatting](#formatting)
    - [Windows prettier issue](#windows-prettier-issue)
- [API endpoints](#api-endpoints)
- [Development helpers](#development-helpers)
  - [MongoDB Locks](#mongodb-locks)
  - [Proxy](#proxy)
- [Docker](#docker)
  - [Development image](#development-image)
  - [Production image](#production-image)
  - [Docker Compose](#docker-compose)
  - [Dependabot](#dependabot)
  - [SonarCloud](#sonarcloud)
- [Licence](#licence)
  - [About the licence](#about-the-licence)

## Requirements

### Node.js

Please install [Node.js](http://nodejs.org/) `>= v24` and [npm](https://nodejs.org/) `>= v11`. You will find it
easier to use the Node Version Manager [nvm](https://github.com/creationix/nvm)

To use the correct version of Node.js for this application, via nvm:

```bash
cd apha-insights-ingestion
nvm use
```

## Local development

### Setup

Install application dependencies:

```bash
npm install
```

### Git hooks

Git hooks are managed by [pre-commit](https://pre-commit.com/) (see
[.pre-commit-config.yaml](./.pre-commit-config.yaml)). On commit they run
[detect-secrets](https://github.com/Yelp/detect-secrets), ESLint (with `--fix`)
and Prettier.

Install pre-commit, then install the hooks once after cloning:

```bash
pip install pre-commit   # or: pipx install pre-commit
pre-commit install
```

To run the hooks against every file without committing:

```bash
pre-commit run --all-files
```

To run the full check suite (security audit, format check, lint and tests)
manually or in CI:

```bash
npm run check:all
```

#### Secrets baseline

`.secrets.baseline` records known, accepted findings so `detect-secrets` only
flags new ones. It was generated once with:

```bash
pip install detect-secrets
detect-secrets scan > .secrets.baseline
```

If the hook flags a false positive, update the baseline with
`detect-secrets scan --baseline .secrets.baseline` and commit the result.

### Development

To run the application in `development` mode run:

```bash
npm run dev
```

### Testing

Tests run against a real MongoDB container (see
`adr/containerized-mongo-for-all-tests.adr.md`). To test the application run:

```bash
npm run docker:test
```

### Production

To mimic the application running in `production` mode locally run:

```bash
npm start
```

### Npm scripts

All available Npm scripts can be seen in [package.json](./package.json).
To view them in your command line run:

```bash
npm run
```

### Update dependencies

To update dependencies use [npm-check-updates](https://github.com/raineorshine/npm-check-updates):

> The following script is a good start. Check out all the options on
> the [npm-check-updates](https://github.com/raineorshine/npm-check-updates)

```bash
ncu --interactive --format group
```

### Formatting

#### Windows prettier issue

If you are having issues with formatting of line breaks on Windows update your global git config by running:

```bash
git config --global core.autocrlf false
```

## API endpoints

| Endpoint       | Description |
| :------------- | :---------- |
| `GET: /health` | Health      |

## Development helpers

### MongoDB Locks

If you require a write lock for Mongo you can acquire it via `server.locker` or `request.locker`:

```javascript
async function doStuff(server) {
  const lock = await server.locker.lock('unique-resource-name')

  if (!lock) {
    // Lock unavailable
    return
  }

  try {
    // do stuff
  } finally {
    await lock.free()
  }
}
```

Keep it small and atomic.

You may use **using** for the lock resource management.
Note test coverage reports do not like that syntax.

```javascript
async function doStuff(server) {
  await using lock = await server.locker.lock('unique-resource-name')

  if (!lock) {
    // Lock unavailable
    return
  }

  // do stuff

  // lock automatically released
}
```

Helper methods are also available in `/src/helpers/mongo-lock.js`.

### Proxy

We are using forward-proxy which is set up by default. Services are automatically configured with the proxy environment variables when deployed.

Node.js 24 uses these variables to route outbound HTTP(S) requests through the proxy:

NODE_USE_ENV_PROXY=1
HTTPS_PROXY=...
NO_PROXY=...

No additional proxy configuration is required in the service.

## Docker

Build:

```bash
docker build --no-cache --tag apha-insights-ingestion .
```

Run:

```bash
docker run -e PORT=3002 -p 3002:3002 apha-insights-ingestion
```

### Docker Compose

A local environment with:

- Floci for AWS services (S3, SQS, SNS etc)
- MongoDB
- This service.

Compose files:

- `compose.yaml` — base services, no published ports.
- `compose.override.yaml` — host ports for dev. Auto-loaded by `docker compose up` (no `-f` flags).
- `compose.debug.yaml` — runs the service with the Node inspector attached.
- `compose.test.yaml` — runs the test suite in a dedicated container, no published ports.
- `compose.test.watch.yaml` — runs the test suite in watch mode.

```bash
npm run docker:up        # dev stack: ingestion API + MongoDB + Floci on 3002/27018/4567
npm run docker:debug     # dev stack with the Node inspector on 9231
npm run docker:test      # one-shot test run, isolated project, no port clashes with dev
npm run docker:test:watch
```

The test stack runs under its own Compose project name
(`apha-insights-ingestion-test`) so it can run alongside the dev stack
without clashing on ports, container names, or Mongo data.

Host ports are offset from `apha-risk-insights-backend` (3001/9229/27017/4566)
so both stacks can run side by side on the shared `apha-risk` network. To run
every APHA Risk Insights service together, use
[apha-incubator-core](https://github.com/DEFRA/apha-incubator-core).

Mock AWS resources can be created when Floci starts up by editing the scripts in `./compose/floci/start.d/`.
MongoDB records can also be created when Mongo starts by editing the scripts in `./compose/mongo/`.

The service uses a single S3 bucket (`apha-insights-ingestion-local` locally),
with key prefixes separating the data (e.g. `raw/wahis/`).

This repo owns the bucket: `compose/floci/start.d/10-setup-resources.sh` is the
only place it is defined. The standalone stack runs that script on its own
floci, which keeps no data between restarts. `apha-incubator-core` mounts the same
script into its shared floci and runs it on startup, without defining any
resources itself. The shared floci does persist data, so the script skips
buckets that already exist.

To browse the bucket, install
[stu](https://lusingander.github.io/stu/) (`brew install stu`) and run:

```bash
npm run local-s3                                          # shared floci from apha-incubator-core (4566)
S3_ENDPOINT_URL=http://localhost:4567 npm run local-s3   # this repo's standalone stack
npm run local-s3 -- --prefix raw/wahis/                   # extra args go to stu
```

### Dependabot

We have added an example dependabot configuration file to the repository. You can enable it by renaming
the [.github/example.dependabot.yml](.github/example.dependabot.yml) to `.github/dependabot.yml`

### SonarCloud

Instructions for setting up SonarCloud can be found in [sonar-project.properties](./sonar-project.properties)

## Licence

THIS INFORMATION IS LICENSED UNDER THE CONDITIONS OF THE OPEN GOVERNMENT LICENCE found at:

<http://www.nationalarchives.gov.uk/doc/open-government-licence/version/3>

The following attribution statement MUST be cited in your products and applications when using this information.

> Contains public sector information licensed under the Open Government license v3

### About the licence

The Open Government Licence (OGL) was developed by the Controller of Her Majesty's Stationery Office (HMSO) to enable
information providers in the public sector to license the use and re-use of their information under a common open
licence.

It is designed to encourage use and re-use of information freely and flexibly, with only a few conditions.

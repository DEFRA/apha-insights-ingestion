# Access Mongo through the data/db module

## Status

Accepted

## Context

The Hapi `mongodb` plugin opened the Mongo connection and exposed it only through `server` and `request` decorators. Test setup, scripts and future repositories had to build a Hapi server to reach the database, and repositories could not get the client for transactions. The reference service, `fcp-sfd-object-processor`, exports a module-level `db` that connects on import with top-level `await`, so importing any repository opens a connection.

## Decision

We use `src/data/db.js` as the single source of truth for the Mongo connection. It exposes `connectMongo()`, `getDb()`, `getClient()` and `closeMongo()`. The connection opens lazily when `connectMongo()` is called, not on import. `getDb()` and `getClient()` throw if nothing has connected yet.

The `mongodb` plugin calls `connectMongo()` and `closeMongo()`, and still provides the `server.db`, `server.mongoClient`, `server.locker`, `request.db` and `request.locker` decorators. Test setup calls the same functions.

## Consequences

- The app, tests and scripts share one connection helper.
- New repositories can import `getDb()`/`getClient()` instead of receiving `db` as an argument. Existing route code keeps working.
- Importing a module never opens a connection.
- The client is module-level shared state. Closing it in one place, such as on server stop, closes it for every caller.
- `test/setup.js` opens a real connection for every test file, unit tests included. A unit test that needs the code under test to avoid that connection must `vi.mock('#/data/db.js')`.

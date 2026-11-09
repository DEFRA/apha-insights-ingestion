# Unit tests

Test one module in isolation. Mock all I/O (database, network, filesystem).

- Mirror the `src/` path. Example: `src/services/Foo.js` → `test/unit/services/Foo.test.js`.
- Name files `*.test.js`.
- New tests go in `test/`. Existing co-located `src/**/*.test.js` files move here when you next change them.

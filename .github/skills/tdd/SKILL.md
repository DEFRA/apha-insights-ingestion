---
name: tdd
description: Enforces strict red-green TDD for Node.js/Vitest projects, balancing unit tests with narrow integration tests per the testing pyramid. Use when asked to build a new feature, add functionality, or fix a bug test-first, or when the user invokes "$tdd".
---

# TDD Skill

Drives implementation work through a strict **red → green** loop for Node.js projects using **Vitest**. Refactoring is intentionally **out of scope** for this skill — see [Refactor stage](#refactor-stage-out-of-scope) below.

> **Why this matters:** Tests written after the fact tend to describe what the code does, not what it must do. Writing a failing test first, watching it fail, then writing the minimum code to pass it, keeps behavior specified and regressions caught early.

---

## When to use

- The user explicitly invokes `$tdd`.
- The user asks for a new feature, endpoint, function, or bugfix and hasn't asked to skip tests.
- This skill is normally used **alongside an existing plan or detailed prompt** (e.g. from `20qs` or a ticket) that describes what to build — this skill does not replace that planning step, it drives the test-first execution of it.

---

## Core principles

1. **Strict red → green, every cycle.** Never write implementation code before a test has been run and observed to fail.
2. **Testing pyramid, but unit-heavy with more narrow integration than typical.** Prefer unit tests for logic. Add narrow integration tests for thin slices of a journey where an interface/boundary (e.g. a DB save, an HTTP handler, a queue publish) needs to be proven not broken and robust.
3. **Defensive-first thinking.** Always identify errors and unhappy paths before happy paths when designing test scenarios — bugs live in the edges, not the main flow.
4. **Tests always run in Docker.** Never run tests directly on the host; always use the `monitor-test-output` skill to run and observe tests via the Docker test container running in watch mode.
5. **Narrow integration = one boundary at a time.** When a test is about a specific interface (e.g. "record is saved to the database"), mock everything **outside** that immediate module under test (e.g. mock upstream validation/normalization) with `vi.mock()` / `vi.fn()`, so the test stays focused on the one boundary it's verifying.
6. **Minimal implementation.** Write only enough code to make the current failing test pass — no speculative extra behavior.
7. **Regression check after every green.** Run the full (or clearly relevant) test suite after each passing test, not just the new test in isolation.
8. **Repo-agnostic conventions.** Detect and follow each repo's existing test location, naming, and config (e.g. `test/`, `__tests__/`, `*.test.js`, `*.spec.js`, `vitest.config.*`) rather than assuming a fixed layout.

---

## Refactor stage (out of scope)

This skill deliberately stops at green. Once tests pass, refactoring (cleaning up duplication, improving names, restructuring) is a **separate, later, manual step** the user drives explicitly — do not perform it automatically as part of this skill's loop.

---

## Workflow

### 1. Confirm scope from the plan/prompt

Read the user's plan or detailed prompt for the feature/bugfix. Do not re-run full planning (that's `20qs`'s job) — just extract what's being built and any acceptance criteria already stated.

### 2. Think defensively first, then propose test scenarios

Before writing any test, identify test scenarios **defensively**: start by enumerating errors and unhappy paths **first** — invalid input, missing/malformed data, downstream/dependency failures, timeouts, permission/auth failures, edge cases (empty, null, boundary values), and concurrency/race conditions where relevant. Only once the unhappy paths are identified, add the happy-path scenario(s) needed to prove the feature works (e.g. "valid input saves a record").

For a bugfix, always include one scenario that is a **regression test reproducing the reported bug**.

Once scenarios are identified, write them to a **temporary markdown file** (e.g. `tdd-test-scenarios.md` in the session workspace) as a list, ordered unhappy-path-first, then happy-path, for example:

```markdown
# Test scenarios: <feature/bugfix name>

## Unhappy paths / errors

- Rejects invalid input with a validation error
- Handles downstream service failure without corrupting state
- ...

## Happy paths

- Valid input saves a record
- ...
```

Play this file back to the user with `ask_user` or in your response, and ask if they want any specific scenarios added, removed, or prioritized differently. Do not proceed to step 3 until scenarios are confirmed. Delete the temporary file once scenarios are confirmed and the loop begins (or at the end of the skill run).

### 3. Red → green loop, one scenario/slice at a time

For each confirmed scenario, in order:

1. **Decide test type.** Unit test if it's pure logic/isolated behavior. Narrow integration test if it's about a specific interface boundary (DB, HTTP, external call) — mock only what's _outside_ that immediate module.
2. **Write one focused failing test** for the smallest next slice of behavior. One assertion/behavior focus per test where practical.
3. **Run the test and confirm it fails (red).** Always run tests in Docker using the `monitor-test-output` skill (tests run in watch mode inside a container) — never run tests directly on the host. Never skip this — if it unexpectedly passes, stop and investigate before continuing (the test may be wrong or the behavior may already exist).
4. **Write the minimal implementation code** to make that test pass. Do not add unrelated behavior "while you're in there".
5. **Confirm it passes (green)** via the `monitor-test-output` skill watching the Docker container's logs.
6. **Run the full/relevant test suite** via the same Docker test container (the watch mode re-run, monitored through `monitor-test-output`) to catch regressions before moving to the next slice.
7. Move to the next scenario/slice and repeat from step 1.

### 4. Stop at green

Once all confirmed scenarios are green and the full suite passes, stop. Report what was built and tested. Note explicitly that refactoring, if desired, is a separate follow-up step — do not perform it unless the user asks.

---

## Mocking conventions

- Use Vitest's `vi.mock()` for module-level mocks and `vi.fn()` for individual function mocks.
- Mock collaborators **outside** the module/interface under test only — keep the thing actually being tested real.
- Example: testing "saves a normalized record to the database" — mock the normalization/validation step, use the real DB-save function, assert on what was passed to the (mocked or in-memory) persistence layer.
- Avoid over-mocking: if a narrow integration test mocks so much that it no longer exercises the boundary it claims to test, treat that as a signal to reconsider the test type.

---

## Pre-flight checklist

- [ ] Errors/unhappy paths were identified defensively **before** happy paths
- [ ] Test scenarios were written to a temporary markdown file as a list and shown to the user before writing tests
- [ ] Test scenarios were confirmed with the user before writing tests
- [ ] Every test was run and observed to **fail** before its implementation was written
- [ ] All test runs (red and green) were executed in Docker via the `monitor-test-output` skill — never directly on the host
- [ ] Implementation code added was the minimum needed to pass the current test — nothing extra
- [ ] Test type (unit vs narrow integration) matches the pyramid: unit-heavy, narrow integration reserved for interface/boundary slices
- [ ] Narrow integration tests mock only what's outside the immediate module/interface under test
- [ ] Full/relevant test suite was run after each green to check for regressions
- [ ] Bugfixes include a regression test that reproduced the bug before the fix
- [ ] Test files follow the target repo's existing conventions (location, naming, runner config) — not an assumed fixed structure
- [ ] No refactoring was performed as part of this loop — flagged as a separate follow-up if relevant

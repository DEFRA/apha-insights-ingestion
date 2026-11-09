---
name: refactor
description: Refactors code changed on the current branch for simplicity, duplication, and readability, without altering functionality, reminding the user a different model gets the best results, and validating every change against the test suite (Docker watch-mode container if available, otherwise a direct test run). Use when the user invokes "$refactor", explicitly asks for the Refactor skill, or asks to refactor/clean up/simplify the current branch's code.
---

# Refactor Skill

Refactors the code that has been written on the **current branch** so it is simpler, free of duplication, and as readable as possible — while preserving exact functionality. Runs separately from, and after, the `tdd` skill (which explicitly leaves refactoring out of scope). This skill is **not a code review**: it only reports high-risk issues as a secondary observation, it does not fix them.

> **Why this matters:** Code written under a strict red-green TDD loop is optimized for "make the test pass", not for long-term readability. A dedicated refactor pass, run with a different model for a fresh perspective and validated continuously against the real test suite, cleans this up safely without introducing regressions.

---

## When to use

- The user explicitly invokes `$refactor`.
- The user explicitly asks for the "Refactor" skill.
- The user asks to refactor, clean up, or simplify the code on the current branch.

Do **not** use this skill to review code someone else wrote outside the current branch's changes, and do not use it to add new functionality or fix bugs — that's `tdd`'s job.

---

## Core principles

1. **Functionality must not change.** Every refactor must be behavior-preserving. If a "refactor" would change observable behavior, it's out of scope for this skill.
2. **Scope is the current branch's changed files only.** Never refactor files the branch hasn't touched.
3. **Different model, recommended.** Remind the user at the start that this refactor works best on a different model family than whichever model is currently running (e.g. if currently on a Claude Sonnet model, switch to a GPT model, or vice versa) for a fresh perspective. This is purely informational — do not ask the user to choose or confirm a model; proceed with the refactor regardless of which model is active.
4. **One file at a time, tested every time.** Refactor a single file, then immediately validate against the test suite (via the live Vitest watch-mode container if available, otherwise a direct test run — see step 3 of the workflow) before moving to the next file.
5. **Auto-revert on regression.** If a file's refactor causes a test failure, immediately revert that file's change and move on — do not attempt repeated fixes or block the rest of the run.
6. **Duplication scope = across the branch's changed files.** Look for duplication between the changed files themselves, not the whole repo.
7. **Report high-risk findings, don't fix them.** If something high-risk is spotted while refactoring (e.g. missing error handling, security concerns, potential data loss), note it in the final report as a secondary priority — do not attempt to fix it as part of this skill.
8. **No commits or PRs.** This skill only edits files and reports; committing or opening a PR is a separate, user-driven step (e.g. via `create-pr-from-changes`).

---

## Workflow

### 1. Note the model reminder

Before doing anything else, tell the user: _"For best results, this refactor works best on a different model family than the one currently running (e.g. if running Claude Sonnet, switch to a GPT model, or vice versa)."_ This is a reminder only — do not ask the user to pick or confirm a model, and proceed with the refactor immediately using whichever model is currently active.

### 2. Determine the diff scope

- Check for a git upstream tracking branch: `git rev-parse --abbrev-ref --symbolic-full-name @{u}`.
- If one exists, use it as the base for the diff.
- If none exists, ask the user which base branch to diff against (e.g. `main`, `master`, `develop`).
- List changed files: `git diff --name-only <base>...HEAD` (include uncommitted working-tree changes too).
- If there are no changed files, tell the user and stop — there's nothing to refactor.

### 3. Ensure a test feedback loop is available

1. Check whether Docker is running (e.g. `docker info` succeeds). If it is, try to find or start the watch-mode test container by reusing the `monitor-test-output` skill's [find-test-container.sh](../monitor-test-output/find-test-container.sh) logic (e.g. `npm run docker:test:watch`).
2. If Docker is not running, or the container can't be found/started, fall back to running the test suite directly on the host (e.g. `npm test`), without Docker.
3. If neither Docker nor a direct test run is available (no test script/runner found), tell the user this skill depends on live test feedback and stop.

Record which mode is in use (Docker watch container vs. direct test run) — it determines how validation is done in step 4.

### 4. Refactor loop (per file)

For each changed file, in turn:

1. **Analyze** the file for:
   - Duplication (compare against the other changed files in this branch's diff)
   - Unnecessary complexity / overly clever code
   - Poor naming or unclear structure
   - Dead code introduced during the branch's work
2. **Apply** the refactor edit(s) to that one file, preserving its exact external behavior.
3. **Validate**:
   - If using the Docker watch-mode container, use the `monitor-test-output` skill: watch the container logs for the re-run suite and check for failures.
   - If falling back to a direct test run, re-run the test command (e.g. `npm test`) after each file's edit and check its output/exit code for failures.
4. **On failure (regression detected):**
   - Revert this file's change immediately (`git checkout -- <file>`, or undo the specific edit if uncommitted state must be partially preserved).
   - Record it in the report as **reverted**, with the failing test(s)/reason.
   - Move on to the next file — do not retry or block the run.
5. **On success (tests still pass):**
   - Keep the change.
   - Record it in the report as **applied**, with a one-line description of what was simplified/deduplicated/renamed/etc.
6. **While analyzing**, if anything high-risk is noticed (security issue, swallowed errors, missing validation, potential data loss, etc.), note it separately for the final report. Do not fix it here.

### 5. Final summary report

Once all changed files have been processed, present a report:

```markdown
# Refactor Report

## Applied

- `path/to/file.js`: <what changed, e.g. "extracted duplicated validation into shared helper">

## Reverted (regression detected)

- `path/to/other-file.js`: <failing test/reason>

## High-risk observations (secondary priority — not fixed)

- `path/to/file.js`: <observation, e.g. "catch block swallows error silently">

(Omit any section with no entries.)
```

Do not commit or open a PR automatically — leave that to the user's next step.

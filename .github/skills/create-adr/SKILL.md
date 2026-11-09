---
name: create-adr
description: Creates a consistent Architecture Decision Record (ADR) for a significant decision. Use when asked to record, document, or capture an architectural/technical decision, or before making a significant, hard-to-reverse change to a service.
---

# Create ADR Skill

Authors an Architecture Decision Record (ADR) capturing a significant decision in a
consistent, service-agnostic format. Use this skill instead of hand-rolling ADRs so
records stay uniform across every service.

> **Why this matters:** ADRs preserve the _rationale_ behind hard-to-reverse decisions.
> Consistent structure lets both humans and agents quickly check prior decisions before
> making significant changes, and stay aligned with (or explicitly supersede) them.

---

## When to use

Use this skill when:

- The user asks to record/document/capture a decision, or
- You are about to make a **significant, hard-to-reverse change**, such as: architectural
  patterns, data models, cross-cutting conventions, dependency/library choices, security
  boundaries, or error-handling strategy.

Routine, low-impact changes do **not** need an ADR.

---

## ADR format

Every ADR is a single markdown file with exactly these sections:

| Section        | Purpose                                                   |
| -------------- | --------------------------------------------------------- |
| `Title`        | Short, descriptive name of the decision (the H1 heading). |
| `Status`       | `Proposed`, `Accepted`, `Superseded`, or `Deprecated`.    |
| `Context`      | The problem, forces, constraints, and background.         |
| `Decision`     | The decision, in active voice ("We will ...").            |
| `Consequences` | Resulting trade-offs — positive, negative, and neutral.   |

- **Location:** `adr/` directory at the repository root.
- **Filename:** a verb phrase describing the decision's purpose, suffixed with `.adr.md`
  (e.g. `handling-errors.adr.md`, `choosing-validation-library.adr.md`). Use lowercase
  kebab-case.
- **One file per decision.**

---

## Workflow

### 1. Check existing ADRs first

List and read the ADRs already in `adr/`.

- If this decision is already covered, update or reference the existing ADR instead of
  duplicating it.
- If this decision **contradicts** an existing accepted ADR, do not silently diverge:
  create a **new** ADR and change the old one's `Status` to `Superseded` (note which ADR
  supersedes it).

### 2. Confirm the decision is significant

If it is routine/low-impact, tell the user an ADR is not needed rather than creating noise.

### 3. Gather context

Collect enough to fill each section:

- **Context** — what problem/forces are driving this? Constraints, requirements,
  alternatives considered.
- **Decision** — what exactly are we deciding to do?
- **Consequences** — what gets easier/harder? Trade-offs and any follow-up work.
- **Status** — usually `Proposed` for a new proposal or `Accepted` if already agreed.

Ask the user for anything missing; do not invent rationale.

### 4. Derive the filename

Turn the decision's purpose into a verb phrase + `.adr.md`, lowercase kebab-case.
Ensure it does not collide with an existing file in `adr/`.

Examples:

- Decision about error handling -> `handling-errors.adr.md`
- Decision to adopt a validation library -> `choosing-validation-library.adr.md`

### 5. Write the ADR

Create `adr/<verb-phrase>.adr.md` using the template below. Create the `adr/` directory
if it does not exist.

---

## ADR file template

```markdown
# <Title>

## Status

<Proposed | Accepted | Superseded | Deprecated>

## Context

<The problem, forces, constraints, and background. State facts neutrally.>

## Decision

We will <the decision, stated specifically enough to act on>.

## Consequences

<What becomes easier or harder. Positive, negative, and neutral outcomes, plus follow-up.>
```

---

## Guidance

- Keep it concise — an ADR is a decision record, not a design doc.
- Write `Decision` in active voice: "We will ...".
- Do not fabricate context or consequences; ask if unsure.
- One decision per file. If several decisions are entangled, split them.
- When superseding, cross-link both ADRs and update the old status.

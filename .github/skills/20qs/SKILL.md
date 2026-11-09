---
name: 20qs
description: Acts as a planning partner that builds a plan by asking the user clarifying questions one at a time, capped at 20 questions total. Checks whether resulting decisions warrant an ADR (via the create-adr skill), and if 20 questions isn't enough to resolve ambiguity, summarizes progress and offers to recursively retrigger itself with user confirmation. Use when the user wants help planning a feature, project, or task and needs their requirements drawn out through guided Q&A before a plan is written.
---

# 20qs Skill

Builds a plan collaboratively by asking the user up to **20 questions**, one at a time,
then synthesizes the answers into a concrete, actionable plan.

> **Why this matters:** Plans built on assumptions are often wrong in ways that only
> surface after work has started. Asking focused questions up front — with a hard cap so
> the process doesn't drag on forever — produces a plan grounded in what the user
> actually wants.

---

## When to use

Use this skill when:

- The user asks to plan a feature, project, migration, or task and their requirements
  are not yet fully specified, or
- The user explicitly invokes "20qs" or asks for a Q&A-driven planning session.

Do **not** use this skill when the user has already given a complete, unambiguous spec —
just plan directly instead.

---

## Hard rules

1. **Maximum 20 questions, ever**, for the whole session. Track the running count.
2. **One question per turn.** Use the `ask_user` tool for every question — never bundle
   multiple questions into one message.
3. **Stop early if satisfied.** If you have enough information to write a solid plan
   before reaching 20 questions, stop asking and move to writing the plan. Do not pad the
   session to hit the cap.
4. **Stop at the cap.** If you reach 20 questions and are still missing information,
   stop asking. Distinguish two cases:
   - **Minor gaps** — small, low-impact unknowns that a reasonable assumption can safely
     cover. Note them explicitly in the plan and proceed with stated assumptions (as
     before).
   - **Genuine unresolved ambiguity or misunderstanding** — core requirements are still
     unclear or contradictory in a way that would make the plan likely wrong. Do **not**
     silently paper over this with assumptions. Instead follow the **Escalation** flow in
     Step 4b before finalizing anything.
5. Prefer multiple-choice questions (via `ask_user`'s `choices`) over freeform whenever
   plausible options exist — this keeps the session fast. Use freeform only when the
   answer truly can't be enumerated.
6. Each question should be non-redundant and change the shape of the plan. Don't ask a
   question whose answer wouldn't affect what you build or how.
7. **Check for ADR-worthy decisions once**, after the plan is synthesized (Step 4a) —
   not continuously during the Q&A.
8. **Recursion is unlimited but always user-opt-in.** If genuine ambiguity remains at the
   cap, never retrigger the Q&A automatically — always ask the user first (Step 4b). Each
   retrigger resets the question count to 0/20 for that new round.
9. **Research before asking, when the topic is documented.** If the task touches a
   specific technology, platform, product feature, or system that has authoritative
   documentation (e.g. "Docker sandboxes", a cloud provider service, a framework's
   config, a public API) — read that documentation _before_ asking questions or
   proposing a plan, not after. Use it to challenge your own assumptions: don't ask
   questions the docs already answer, and don't ask questions premised on a
   misunderstanding the docs would correct. This research does not count against the
   20-question cap.
10. **Cite sources.** Any time a question, answer, assumption, or plan step is grounded
    in documentation you read, give the user the link back to that source (inline or in
    a short "Sources" note) so they can verify it themselves.

---

## Workflow

### 0. Research relevant documentation first

Before asking any questions, identify whether the task references a specific
technology, product, feature, or system that has findable authoritative documentation
(official docs, README, API reference, RFC, vendor guide, etc.).

- If so, fetch and read that documentation first (e.g. via `web_fetch`, a repo's
  README/docs files, or other available lookup tools) **before** drafting questions or
  assumptions.
- Use what you learn to:
  - Correct or drop any assumption you were about to make that the docs contradict.
  - Skip questions the docs already answer definitively.
  - Sharpen remaining questions so they're grounded in real constraints/options (e.g.
    prefer multiple-choice questions using the actual options the docs describe, not
    guessed ones).
- Keep a short running list of the sources you consulted (title + URL/path). You'll
  need to cite these later whenever you reference what they say.
- If no clearly relevant documentation exists (novel/internal/undocumented topic), skip
  this step and say so briefly rather than fabricating a citation.
- This step can be repeated if, mid-session, a new sub-topic comes up that has its own
  documentation worth checking — always before asking about that sub-topic, not after.

### 1. Establish the goal

Ask (question 1, if not already clear from context) what the user is trying to achieve
and why, in one sentence. This anchors every later question.

### 2. Ask targeted planning questions

Work through the areas below **only as needed** — skip any area already answered by
context or a prior question. Keep a running tally of questions asked out of 20.

Typical areas to probe (not a fixed script — adapt to the task):

- **Scope** — what's in vs. explicitly out of scope?
- **Constraints** — deadlines, tech stack, budget, compatibility requirements?
- **Success criteria** — how will we know the plan/feature succeeded?
- **Users/stakeholders** — who is this for, who needs to sign off?
- **Dependencies** — existing systems, data, or teams this touches?
- **Risks/unknowns** — what's the riskiest or least-understood part?
- **Priorities** — if trade-offs are needed, what matters most (speed, quality, cost)?
- **Non-functional needs** — performance, security, accessibility, scale?

After each answer, briefly decide: is the plan already clear enough, or is there a
genuine open question left? Only ask if it's genuine.

### 3. Track progress

Before each question, keep a mental (or scratch) count: "Question N of 20". If asking a
question would exceed 20, do not ask it — proceed to step 4 instead.

### 4. Synthesize the plan

Once done asking (early stop or cap reached), write a plan containing:

- **Summary** — one paragraph restating the goal based on the answers.
- **Plan steps** — a numbered, actionable sequence of steps to execute.
- **Assumptions** — anything not covered by the Q&A that you had to assume, especially if
  the 20-question cap was hit before full clarity was reached.
- **Open questions** (if any remain) — call these out explicitly rather than silently
  guessing on anything important.

### 4a. Check for ADR-worthy decisions

Once the plan is written, do a single pass over its **Decisions** and **Plan steps** to
check whether any of them are significant and hard to reverse — the same bar the
`create-adr` skill uses: architectural patterns, data models, cross-cutting conventions,
dependency/library choices, security boundaries, or error-handling strategy. This check
happens **once**, here, not throughout the Q&A.

- If nothing qualifies, say so explicitly (e.g. "No ADR updates needed for this plan")
  and move on — don't create noise.
- If one or more decisions qualify, invoke/follow the `create-adr` skill's workflow for
  each one rather than re-implementing ADR logic here:
  1. List and read existing ADRs in `adr/` first. If the decision is already covered,
     update or reference that ADR instead of duplicating it.
  2. If it **contradicts** an existing accepted ADR, create a new ADR and mark the old
     one's `Status` as `Superseded` (cross-linking both).
  3. Otherwise, create a new ADR file (`adr/<verb-phrase>.adr.md`, lowercase kebab-case)
     using `create-adr`'s standard template (Title / Status / Context / Decision /
     Consequences).
- Summarize what ADRs were created/updated (or confirm none were needed) as part of the
  plan output so the user can see the effect at a glance.

### 4b. Escalate if 20 questions wasn't enough

Only reached when the cap was hit **and** genuine unresolved ambiguity or
misunderstanding remains (not just minor gaps — see hard rule 4).

1. Write a concise summary of what's been learned so far: the answers gathered, the
   shape of the plan so far, and precisely what remains ambiguous or contradictory.
2. Present this to the user directly (not via `ask_user`, since it needs explanation),
   making clear this is a decision point, e.g.:

   > "20 questions wasn't enough to fully resolve this. Here's what I've learned so far:
   > [summary]. I suggest retriggering this skill with this summary as context for
   > another round of questions. Note: needing more than 20 questions can be a sign the
   > piece of work is too large and should be split into smaller pieces instead — worth
   > considering as an alternative to asking more questions."

3. Then use `ask_user` with explicit choices to let the user decide what happens next:
   - Retrigger the 20qs skill, seeded with this summary as prior context (don't re-ask
     anything already answered), with the question count reset to 0/20 for the new round.
   - Proceed anyway with the plan using clearly stated assumptions for the remaining gaps.
   - Split the work into smaller pieces and plan each piece separately.
4. If the user chooses to retrigger, repeat from Step 1 of the workflow using the summary
   as anchoring context. This can recurse indefinitely — there is no cap on the number of
   rounds, but each round always requires the user's explicit go-ahead first.

### 5. Confirm before executing

Present the plan to the user and ask if they'd like you to proceed, revise, or adjust
before doing any actual implementation work.

---

## Guidance

- Never ask more than one question per `ask_user` call.
- Don't re-ask something the user already answered earlier in the conversation.
- If the user says "just plan it" or similar, stop early and go straight to step 4 using
  whatever information exists plus clearly stated assumptions.
- Keep questions short and concrete; avoid compound questions ("and also...").
- The number 20 is a hard ceiling **per round**, not a target — fewer questions is better
  if the plan is already clear. Each recursive retrigger (Step 4b) gets its own fresh
  0/20 budget, but only starts with explicit user confirmation.
- The ADR check (Step 4a) runs exactly once, after the plan is synthesized — never mid-Q&A.
- Reuse the `create-adr` skill's workflow and template for any ADR work; don't
  reimplement or fork its logic inside 20qs.
- Escalating (Step 4b) is reserved for genuine unresolved ambiguity/misunderstanding, not
  every minor gap — most sessions should still end in a normal plan with a short
  assumptions list.

---
name: grill-me
description: Grilling session that reads the connected docs first, challenges a plan against the existing domain model one question at a time, sharpens terminology, and records what lands in the Craftspace brain (Area pages, Decisions, gotchas, Skills). Runs mandatory feature-overlap detection before any new feature. Use when stress-testing a plan, filling a thin Area, defining domain terms, hardening terminology, or proposing a new feature.
---

# Grill Me

Interview the member relentlessly about every aspect of this plan or Area until you reach a shared
understanding, and build the brain as you go. Walk down each branch of the design tree, resolving
dependencies between decisions one-by-one.

This is the *active* discipline. Reading the brain for vocabulary is a habit any skill can have; this
skill is for when you are changing the model, not just consuming it.

## How to ask

**One question per message. Never batch.** Do not reach for a multi-question tool to ask four things
at once. Batching buys four shallow answers instead of one real one, and it hides the fact that
question two should have changed based on the answer to question one. Ask, wait, read the answer,
let it choose the next question.

**Every question carries your recommended answer and the reason for it.** The member should be able
to reply "yes" or "no, because…" without writing an essay. A bare question with four neutral options
is you handing back the thinking you were asked to do.

**Ground every question in something you have already read.** Before the first question, read the
code the plan touches and name it: the file, the function, the constraint. "`loop-executor.ts`
returns out of the whole loop on any non-RUNNING verdict, so branches cannot pause independently.
I would give each branch its own run. Agreed?" beats "how should parallelism work?"

**A fact is yours to find; a decision is theirs to make.** If a question can be answered by reading
the codebase, the connected docs, or the brain, read it instead of asking.

**Never accept a vague answer, and never leave a bad question standing.** If the reply is "I don't
understand", the question was the problem: make it smaller and more concrete, add a worked example,
ask again. If the reply is fuzzy ("maybe", "depends"), name the two branches it splits into and ask
which one.

**Do not act on the plan until the member says you have reached shared understanding.**

## Where results land — read this first

Two write paths; the repo decides which:

- **This repo has a local `brain/` folder (Brain as Code).** The repo is the source of truth, so
  **write markdown files, not MCP tools.** Everywhere below says `upsert_page` / `upsert_decision` /
  `upsert_skill`; in a `brain/` repo each means "write or edit the file." Area pages and their
  graduated leaves are `brain/wiki/<slug>.md`, a Decision is `brain/decisions/<slug>.md` with
  `status: accepted`, a Skill is `brain/skills/<slug>.md` with `name:` + `description:`. Identity is
  the filename, not an id — to update a page, edit its file; to graduate a term, add a new wiki file
  and link it by relative path instead of `parentId`. No spaceId. Your changes ride a PR.
- **No local `brain/` folder.** Write over MCP with the `upsert_*` tools, ids, and `parentId` exactly
  as written below. If the `craftspace` MCP tools are unavailable, **stop and say so**. Do not fall
  back to scattering repo files, and do not skip overlap detection — a silent skip is how a duplicate
  feature gets built.

| What crystallised | Where it goes | Tool |
|---|---|---|
| A hard-to-reverse call with a real trade-off | a **Decision**, nested under its Area page | `upsert_decision` |
| A domain term, a feature's behaviour, key files | that **Area page** (its glossary spine) | `upsert_page` |
| A term that outgrew its line | a **child page** under the Area | `upsert_page` |
| A trap that cost someone hours | a page titled `Gotcha: <what bites you>` | `upsert_page` |
| A reusable procedure | a **Skill** | `upsert_skill` |

Page and glossary shape is in [PAGE-FORMAT.md](./PAGE-FORMAT.md). Decision shape and the bar for
offering one is in [DECISION-FORMAT.md](./DECISION-FORMAT.md). Create nothing eagerly — a page, a
leaf, a Decision each appear only when there is something real to write on them.

## Before grilling a NEW feature: overlap detection (mandatory)

Redundant features are forbidden. If the plan introduces something that sounds like a new feature,
**stop and run overlap detection before grilling the design**. Complete all five checks first:

1. **The brain** — `search_pages` for the concept and read the Area pages that hit. This is the
   primary inventory of what already exists.
2. **Components / services / hooks** — Glob for `*<keyword>*` source files and Grep their contents;
   also check directory patterns named after the concept.
3. **Route definitions** — Grep the server's route files for one already covering the use case.
4. **Shared types** — Grep the shared/types package for existing types or enums for the concept.
5. **Feature flags / plan limits** — Grep for a capability or plan flag that already gates it.

Always present findings before proceeding — never silently skip this:

| Finding | Action |
|---|---|
| **Close match** | Present it; recommend extending the existing feature. Do NOT design a new feature without explicit user approval. |
| **Partial overlap** | Present the overlapping parts; ask whether to merge or keep separate, and record the rationale. |
| **No match** | Confirm no overlap was found, then proceed with the new feature design. |

## During the session

**Docs first.** If the Area has connected docs or tools, read them and turn what they already say into
spine entries before you ask. Grill fills the gaps the docs do not cover — it does not re-interview
what is already written down.

**Walk three things, in this order:** **Terms** (the words this Area uses for its own things), then
**How it works** (the plays, processes, who does what — the shape, not every detail), then
**Decisions** (the hard-to-reverse calls and the reasoning).

### Scan for domain terms

Collect every noun, verb, or phrase that names a core entity, names a process, carries
codebase-specific meaning, or is used inconsistently.

### Flag ambiguity before resolving — never resolve silently

| Problem | Example | How to flag |
|---|---|---|
| **Ambiguity** — same word, different meanings | "connection" = saved credential vs live socket | List both usages; ask which is canonical |
| **Synonym collision** — different words, same concept | "run" vs "execution" vs "flow run" | Identify the preferred term; mark the rest as `Avoid` |
| **Undefined jargon** — used but never defined | a word appears with no explanation | Ask for a one-sentence definition |

### Challenge against the glossary

When the member uses a term that conflicts with the canonical language on the Area's page, call it out
immediately. "The page defines Sandbox as the in-process box and lists 'pool' under Avoid, but you're
saying 'pool' — which is it?"

### Sharpen fuzzy language

When a word is overloaded ("account" = the company, or the login?), propose a precise split and let the
member pick.

### Discuss concrete scenarios

Stress-test domain relationships with specific scenarios that probe edge cases and force precision
about the boundaries between concepts.

### Cross-reference with code

When the member states how something works, check whether the code agrees and surface contradictions.
Keep multi-tenancy and editions in view where they apply.

### Grill the implementation, not just the shape

"Branches run in parallel" is a wish, not a design. Keep descending until each answer names a
mechanism: which entity gains a column, whose contract changes, what the new failure mode is. The
questions worth asking are the ones whose answers you could hand to an implementer without them
coming back.

Reach for these the moment an answer stays abstract:

- **The constraint** — what in the code as it stands makes this hard? Name it, then ask whether it
  moves or whether the design routes around it.
- **The unit** — what is the smallest thing that can fail, retry, or resume on its own? If the design
  needs a smaller one than exists today, that is the whole change.
- **The blow-up** — at ten and a thousand times the expected volume, what breaks first: memory, log
  size, queue depth, a third-party rate limit?
- **The half-state** — one part succeeded, one failed, one is still running. What does the member see
  in the UI, and what can they do about it?
- **The upgrade** — an existing customer upgrades into this. Does anything behave differently without
  them asking for it? If yes, the default is wrong.
- **The reuse** — what already in this codebase does most of this job, and why is it not enough?

### Ask where it lives

When a term is backed by code, ask which directories hold it and what the entry point is called. This
is the one thing a reader cannot derive from the page.

### Record it inline — don't batch

The moment a fact resolves, write it to the brain right there, not at the end of the session. Route
every fact to exactly one surface, and never let two surfaces restate the same thing. A dated one-off
that isn't durable yet goes to **MEMORY**, not the spine.

## Re-running on the same Area

- Read the existing spine, its graduated leaves, and the Decisions first. Confirm what still holds — do
  not re-ask it.
- Update terms **in place** on the same spine. Never start a second glossary for one Area.
- When a new answer conflicts with a recorded term or decision, **challenge it out loud** ("the spine
  says a Lead is X, but you just described Y — which is right?"), then reconcile to one truth. Do not
  silently overwrite.

## Lint before you stop

Merge duplicate entries, cut stale lines, and fix any pointer whose leaf you moved or renamed. Check
every **Key files** path still exists and fix or drop the ones that don't — a dead path never announces
itself, it just quietly sends the next agent nowhere.

## When to stop

Stop when the Area's core terms are pinned and the decisions worth keeping are recorded — usually a
handful of terms and one or two decisions, not an exhaustive dump.

## Rules

- Record only what the member actually said. Never invent or infer a fact, a term, a why, or a path
  into the brain.
- Keep the member's own words for domain terms. That wording *is* the language the team speaks.
- No em dashes in anything you write into the brain (brand voice).

---
name: grill-me
description: Use to capture an Area's language and decisions: interview the member one question at a time (reading any connected docs first), then write the Area as a glossary spine plus graduated child pages, with Decision records for the hard-to-reverse calls.
---

# Grill an Area

Grill interviews the member about one **Area** (Sales, Marketing, Engineering, Operations, …)
to pull that part of the business out of their head and into Craftspace. The Area page becomes a
**glossary spine** — one line per term — and any term that outgrows a line **graduates** to its own
small child page. Hard-to-reverse calls go to **Decision records**, repeatable procedures to
**Skills**. Run it when an Area is thin, or to sharpen one that has drifted.

## Before you start

1. Pick the Area. If the member did not name one, ask which. Areas are the top-level Team pages, so find the right one with `list_pages`.
2. Read what's already there with `read_page`: the Area page (its spine), its graduated child pages, and the Area's existing Decision records. Don't re-ask what the brain already knows — build on it.
3. If a spine already exists you are refining, not starting fresh — load its terms and reconcile as you go (see "Re-running" below).

## How to interview

- **One question at a time.** Wait for the answer before asking the next. Never batch questions.
- **Always recommend an answer** — your best guess from what you read plus general knowledge, so the member can confirm or correct rather than write an essay (for example: "I'd call this the *Pipeline*, the ordered stages a deal moves through. Is that your word, or do you say something else?").
- **Walk three things, in this order:** first **Terms** (the words this Area uses for its own things — pin one canonical word each and the alternatives to avoid), then **How it works** (the plays, processes, and who does what — capture the shape, not every detail), then **Decisions** (the hard-to-reverse calls and the reasoning behind them).
- **Ask where it lives.** When a term is backed by code, ask which directories hold it and what the entry point is called. This is the one thing a reader cannot derive from the page, and without it every future agent re-greps the repo to find the same files (see "Key files" below).
- **Sharpen fuzzy language.** When a word is overloaded ("account" = the company, or the login?), propose a precise split and let the member pick.
- **Docs first.** If the Area has connected docs or tools, read them and turn what they already say into spine entries before you ask. Grill fills the gaps the docs do not cover — it does not re-interview what is already written down.

## Write results back as you go

Capture each fact the moment it resolves — don't save it all for the end. Route every fact to exactly one surface, and never let two surfaces restate the same thing:

- **A term or fact** → the Area **glossary spine** (the Area page itself), one line per term. `upsert_page` the Area page with its own id — read it first, keep the existing lines, fold the new one in (the body is a full replacement).
- **A term that outgrows a line** (it needs its own examples, edge cases, or sub-parts) → **graduate** it: `upsert_page` a small child page with the Area as `parentId` (omit id to create), move the detail there, and leave a one-line pointer on the spine.
- **A hard-to-reverse call** (a pricing model, a vendor lock-in, a hiring policy) → `upsert_decision`, never the spine. The spine links to it; it never restates the why. One call per decision, omit id to record a new one.
- **A repeatable procedure** → `upsert_skill`. The spine links to it; it never restates the how.
- **A dated one-off** not yet durable → append a line to **MEMORY**. Promote it to the spine only once it proves it belongs.

Keep each spine line to a sentence — what the term IS, not what it does. Be opinionated: pick the best word, list the rest under `_Avoid_`. Only capture terms specific to this company's Area; skip generic business words the whole world already shares.

Shape a spine line like this — a term that has graduated ends in a pointer to its leaf:

```
**Pipeline** — the ordered stages a deal moves through, first touch to closed. _Avoid_: funnel, deal flow
**Onboarding** — how a new customer goes from signed to live → see *onboarding*
```

Shape a graduated leaf like this — one idea, and links out instead of restating the why or the how:

```
# Onboarding
How a new customer goes from signed to live: the steps, who owns each, the usual snags.
Why we gate on a kickoff call: decision → *kickoff-gate*
How to run the kickoff: skill → *run-a-kickoff*
```

## Key files

A leaf backed by code ends in a **Key files** list: where that thing lives, so the next agent reads
instead of grepping. Everything else on the page says what a thing IS and why. This says where.

```
# RBAC
Who may do what inside a project. Roles carry permissions; every request asserts against them.
Entry point: `rbacService.assertPrincipalAccessToProject()`

## Key files
- `packages/server/api/src/app/ee/projects/` — role enforcement
- `packages/server/api/src/app/ee/project-members/` — member CRUD, role lookup
- `packages/web/src/features/members/` — members UI
```

Three rules, and they all exist because pointers rot:

- **Directories, not files, wherever a directory covers it.** A file gets renamed; a module directory
  rarely moves. Name a single file only when it genuinely is one file.
- **Never line numbers.** Any edit above a line invalidates it, so it is wrong within a day and wrong
  silently. Paths only.
- **Name the entry-point symbol** when there is one. `rbacService.assertPrincipalAccessToProject()`
  survives a file move and is one deterministic grep away, which no path can promise.

Only add this when the member actually knows the paths. A guessed path is worse than no path: it reads
as authoritative and sends the next agent to the wrong place. Leave it out and let them re-grill later.

## Re-running on the same Area

Grill is idempotent-minded. On a second pass:

- Read the existing spine, its graduated leaves, and the Decisions first. Confirm what still holds — do not re-ask it.
- Update terms **in place** on the same spine (and its leaves). Never start a second glossary for one Area.
- When a new answer conflicts with a recorded term or decision, **challenge it out loud** ("the spine says a Lead is X, but you just described Y — which is right?"), then reconcile to one truth and update the page. Do not silently overwrite.

## Lint before you stop

Run one quick pass over the Area: merge duplicate entries, cut lines that have gone stale, and fix any pointer whose leaf you moved or renamed. This bookkeeping is what keeps the spine trustworthy as it grows.

Check every **Key files** path still exists, and fix or drop the ones that don't. It is a cheap check and
the only one that catches rot, since a dead path never announces itself — it just quietly sends the next
agent nowhere.

## When to stop

Stop when the Area's core terms are pinned and the decisions worth keeping are recorded — usually a
handful of terms and one or two decisions, not an exhaustive dump. Keep the house voice: concise,
plain, no walls of text. A tight glossary the team trusts beats a long one they skim.

## Rules

- If the `craftspace` MCP tools are not available, say so and stop.
- Record only what the member actually said. Never invent or infer a fact into the brain, a term, a
  why, or a path.
- Keep the member's own words for domain terms. That wording *is* the language the team speaks.
- No em dashes in anything you write into the brain (brand voice).

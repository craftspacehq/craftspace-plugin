---
name: grill-me
description: >
  Interview the user to pull durable company knowledge out of their head and
  write it back into the Craftspace company brain, filling a thin Area (Sales,
  Marketing, Engineering, Operations) with its real language, decisions, and
  process. Use when the user says "grill me", "/grill-me", "interview me",
  "fill in a thin Area", "capture context", or asks you to help document how
  the company actually works. Requires the craftspace MCP server.
---

# Grill me

You interview the user, hard, and capture what they say back into the Craftspace
company brain over the `craftspace` MCP. A thin Area walks in vague, walks out
with its real terms, decisions, and process recorded for the team. If the
`craftspace` MCP tools are not available, say so and stop.

## 1. Pick a target

- If the user named an Area or topic, use it.
- Otherwise `list_pages` to see the spaces and Areas, then read `MEMORY` and each
  Area page enough to judge which is thinnest or most valuable to fill. Propose
  that one in a line and confirm before diving.

## 2. Read before you ask

Read the target Area page, `MEMORY`, and any related decisions (`search_pages`)
first. Never ask what the brain already records. Your questions target the gaps.

## 3. Grill

Ask sharp, concrete questions **one at a time**. Do not dump a survey.

- Chase vague answers. "It depends" → depends on what, give me the last real case.
- Always ask *why*, not just *what*. The why is what the team can't reconstruct.
- Pull real numbers, names, and examples, not abstractions.
- Cover, roughly in order: what this Area does and owns, the terms and language
  the team uses (keep their exact wording), the key decisions and the why behind
  each, the current process step by step, the tools, the open problems and
  gotchas.
- Stop when answers go thin, repeat, or the user taps out.

## 4. Capture as you go

The moment a durable fact lands, write it to the right place. Do not batch it all
to the end. `search_pages` first so you extend an existing page, never duplicate.
Pass the right `spaceId` (default Shared).

- Quick dated note not yet worth its own page → append a line to `MEMORY`.
- Substantial content for an Area → `edit_page` to extend the Area page, or
  `create_page` under that space.
- A hard-to-reverse call (pricing, vendor lock-in, architecture bet, policy) →
  `create_decision`, so the team inherits the why, not just the what.
- A reusable procedure that worked → `create_skill`.

## 5. Close

Summarize what you captured and where it landed, then name the next thinnest Area
to grill later.

## Rules

- Record only what the user actually said. Do not invent or infer facts into the
  brain.
- Keep the user's own words for domain terms. That wording *is* the ubiquitous
  language.
- No em dashes in anything you write into the brain (brand voice).

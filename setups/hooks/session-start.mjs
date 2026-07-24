#!/usr/bin/env node
// Craftspace SessionStart hook — prime the mandate. Portable across Claude Code, Codex, Cursor.
//
// The MCP server ships the same rules in its `instructions`, but clients truncate or drop those.
// SessionStart stdout lands directly in the model's context every session, so the read-first /
// write-back rules — and specifically "record hard-to-reverse decisions" — are always present.

process.stdout.write(
  [
    'This workspace is connected to Craftspace, your team’s company brain (MCP server "craftspace").',
    '',
    'Two standing rules for this session:',
    '1. READ FIRST — before acting on how this company works (its people, product, decisions,',
    '   process, tools), consult the brain. If this repo has a local brain/ folder (Brain as Code),',
    '   grep it directly (same context on disk, zero setup); otherwise search_pages / list_pages, then',
    '   read_page / read_skill. Don’t answer from assumptions the brain may already hold.',
    '2. WRITE BACK — the moment a durable learning lands, save it. WHERE it goes depends on the repo:',
    '   • If this repo has a local brain/ folder (Brain as Code), the repo is the source of truth, so',
    '     WRITE A MARKDOWN FILE and do NOT call the upsert_* tools: a Decision in brain/decisions/<slug>.md',
    '     (frontmatter status: accepted, body of # Title then Decision/Context/Why/Consequences), a Skill',
    '     in brain/skills/<slug>.md (frontmatter name + description), a note in brain/wiki/<slug>.md. A',
    '     file rides your PR and review; an MCP write would push straight to main and skip it. Grep brain/',
    '     first and EDIT the file that already covers the topic instead of adding a duplicate.',
    '   • Otherwise write over MCP: upsert_page for a note or gotcha, upsert_skill for a reusable',
    '     procedure, upsert_decision for any hard-to-reverse call (an architecture bet, a vendor lock-in,',
    '     a pricing or policy decision) so the team inherits the why, not just the what.',
    '   Keep every write tight — a few plain sentences, not an essay. A learning left in this session is',
    '   lost to the team.',
    '',
    'You will be reminded before this session ends if it did real work but recorded nothing.',
  ].join('\n'),
)

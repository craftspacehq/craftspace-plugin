#!/usr/bin/env node
// Craftspace SessionStart hook — prime the mandate.
//
// The MCP server ships the same house rules in its `instructions`, but clients truncate or drop
// those. SessionStart stdout lands directly in the model's context every session, so the read-first
// / write-back rules — and specifically "record hard-to-reverse decisions with create_decision" —
// are always present, not left to a truncatable server string.

process.stdout.write(
  [
    'This workspace is connected to Craftspace, your team’s company brain (MCP server "craftspace").',
    '',
    'Two standing rules for this session:',
    '1. READ FIRST — before acting on how this company works (its people, product, decisions,',
    '   process, tools), search_pages / list_pages and list_skills, then read the detail. Don’t',
    '   answer from assumptions the brain may already hold.',
    '2. WRITE BACK — the moment a durable learning lands, save it: create_page for a note or gotcha,',
    '   create_skill for a reusable procedure, and create_decision for any hard-to-reverse call',
    '   (an architecture bet, a vendor lock-in, a pricing or policy decision) so the team inherits',
    '   the why, not just the what. A learning left in this session is lost to the team.',
    '',
    'You will be reminded before this session ends if it did real work but recorded nothing.',
  ].join('\n'),
)

#!/usr/bin/env node
// Craftspace Stop hook — the forcing function.
//
// An MCP's instructions are advisory: agents routinely finish a session having made a real
// decision without ever recording it to the company brain. This hook blocks the FIRST stop of a
// substantive session that wrote nothing back, and hands the model a directive to either record
// the decision/learning now (create_decision / create_page / create_skill) or explicitly decline.
//
// Loop-safe: we block at most once. `stop_hook_active` is true when this stop was itself triggered
// by a stop hook — that is our escape hatch, so the model can decline and actually finish.
//
// Fail-open: any parse/read error allows the stop. A hook bug must never trap the user in a session.

import { readFileSync } from 'node:fs'

// A Craftspace write already happened when the transcript holds a call to a craftspace MCP tool
// that mutates the brain. Match by substring, not an exact prefix: depending on how the client
// namespaces a plugin-bundled server the tool may be `mcp__craftspace__create_decision` or carry
// a longer `mcp__…craftspace…__create_decision` prefix — both count.
const WRITE_BACK_RE = /craftspace.*__(create_decision|create_page|create_skill|edit_page|edit_skill)$/

// File-mutating tools: the strongest "this session did real work" signal for a coding agent.
const WORK_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit'])

function allow() {
  process.exit(0)
}

function block(reason) {
  process.stdout.write(JSON.stringify({ decision: 'block', reason }))
  process.exit(0)
}

function main() {
  let input
  try {
    input = JSON.parse(readFileSync(0, 'utf8'))
  } catch {
    return allow()
  }

  // Already nudged this stop cycle — let the model finish whatever it decided.
  if (input.stop_hook_active) return allow()

  const transcriptPath = input.transcript_path
  if (!transcriptPath) return allow()

  let wroteBack = false
  let didFileWork = false
  let assistantTurns = 0
  try {
    const lines = readFileSync(transcriptPath, 'utf8').split('\n')
    for (const line of lines) {
      if (!line.trim()) continue
      let entry
      try {
        entry = JSON.parse(line)
      } catch {
        continue
      }
      const msg = entry.message
      if (!msg || msg.role !== 'assistant') continue
      assistantTurns++
      const content = Array.isArray(msg.content) ? msg.content : []
      for (const block of content) {
        if (block?.type !== 'tool_use' || typeof block.name !== 'string') continue
        if (WRITE_BACK_RE.test(block.name)) wroteBack = true
        if (WORK_TOOLS.has(block.name)) didFileWork = true
      }
    }
  } catch {
    return allow()
  }

  // Already recorded something — nothing to force.
  if (wroteBack) return allow()

  // Trivial exchange (a quick question, a lookup) — don't nag.
  const substantive = didFileWork || assistantTurns >= 8
  if (!substantive) return allow()

  return block(
    'Before you finish: this session did real work but recorded nothing to the Craftspace company brain. ' +
      'If a hard-to-reverse decision was made (an architecture bet, a vendor choice, a pricing or policy call), ' +
      'record it now with mcp__craftspace__create_decision. If a durable gotcha or learning emerged, ' +
      'save it with mcp__craftspace__create_page; if a reusable procedure worked, mcp__craftspace__create_skill. ' +
      'Search first (search_pages) so you extend rather than duplicate. If nothing here is genuinely worth ' +
      'keeping for the team, say so in one line and stop.',
  )
}

main()

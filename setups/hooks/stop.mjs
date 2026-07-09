#!/usr/bin/env node
// Craftspace Stop hook — the forcing function, portable across clients.
//
// Blocks the FIRST stop of a substantive session that wrote nothing back to the company brain, and
// hands the model a directive to record the decision/learning now (or explicitly decline). Works on
// Claude Code, Codex, and Cursor: all three feed the hook JSON on stdin, and all three treat exit
// code 2 with a stderr message as "keep going, here is why".
//
// Loop-safe: nudges once. `stop_hook_active` is true when this stop was itself triggered by a stop
// hook — that is the escape hatch. Fail-open: any parse/read error allows the stop, so a hook bug
// can never trap a session.

import { readFileSync } from 'node:fs'

// Bare craftspace write-tool names (client prefixes/namespaces stripped before matching).
const WRITE_TOOLS = new Set([
  'create_decision',
  'create_page',
  'create_skill',
  'edit_page',
  'edit_skill',
])

// File-mutating tools: the "this session did real work" signal. Claude Code names on the left,
// Codex on the right (apply_patch = its edit tool).
const WORK_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'apply_patch'])

// The bare tool name from either transcript dialect: strip a Claude Code `mcp__server__` prefix.
const bareName = (name) => (typeof name === 'string' ? name.split('__').pop() : '')

function allow() {
  process.exit(0)
}

function block(reason) {
  process.stderr.write(reason)
  process.exit(2)
}

// Pull every tool name called in the session out of whichever transcript dialect this is.
// Claude Code: {message:{role:'assistant',content:[{type:'tool_use',name}]}}.
// Codex: {type:'response_item',payload:{type:'function_call',name}} (+ custom_tool_call for edits).
function toolNamesFrom(lines) {
  const names = []
  for (const line of lines) {
    if (!line.trim()) continue
    let entry
    try {
      entry = JSON.parse(line)
    } catch {
      continue
    }
    const msg = entry.message
    if (msg && msg.role === 'assistant' && Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (block?.type === 'tool_use' && typeof block.name === 'string') names.push(block.name)
      }
    }
    const payload = entry.type === 'response_item' ? entry.payload : undefined
    if (payload && (payload.type === 'function_call' || payload.type === 'custom_tool_call')) {
      if (typeof payload.name === 'string') names.push(payload.name)
    }
  }
  return names
}

function main() {
  let input
  try {
    input = JSON.parse(readFileSync(0, 'utf8'))
  } catch {
    return allow()
  }
  if (input.stop_hook_active) return allow()
  if (!input.transcript_path) return allow()

  let names
  try {
    names = toolNamesFrom(readFileSync(input.transcript_path, 'utf8').split('\n'))
  } catch {
    return allow()
  }

  const wroteBack = names.some((n) => WRITE_TOOLS.has(bareName(n)))
  if (wroteBack) return allow()

  const didFileWork = names.some((n) => WORK_TOOLS.has(n) || WORK_TOOLS.has(bareName(n)))
  const substantive = didFileWork || names.length >= 6
  if (!substantive) return allow()

  return block(
    'Before you finish: this session did real work but recorded nothing to the Craftspace company ' +
      'brain. If a hard-to-reverse decision was made (an architecture bet, a vendor choice, a pricing ' +
      'or policy call), record it now with the craftspace create_decision tool. If a durable gotcha ' +
      'or learning emerged, save it with create_page; if a reusable procedure worked, create_skill. ' +
      'Search first (search_pages) so you extend rather than duplicate. If nothing here is genuinely ' +
      'worth keeping for the team, say so in one line and stop.',
  )
}

main()

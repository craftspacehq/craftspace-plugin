#!/usr/bin/env node
// Craftspace Stop hook — the forcing function, portable across clients.
//
// Blocks the FIRST stop of a substantive session that wrote nothing back to the company brain, and
// hands the model a directive to record the decision/learning now (or explicitly decline). Works on
// Claude Code, Codex, and Cursor: all three feed the hook JSON on stdin, and all three treat exit
// code 2 with a stderr message as "keep going, here is why".
//
// Loop-safe: nudges ONCE PER SESSION. Two guards. (1) `stop_hook_active` is true when this stop was
// itself triggered by a stop hook — the immediate escape hatch. (2) A per-session marker file: once
// we have nudged for a session_id we never nudge it again, so a long session with many user turns is
// not re-blocked on every turn's stop (stop_hook_active resets after each fresh user message and does
// not cover that). Fail-open: any parse/read/marker error allows the stop, so a hook bug can never
// trap a session.

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Bare craftspace write-tool names (client prefixes/namespaces stripped before matching).
const WRITE_TOOLS = new Set(['upsert_decision', 'upsert_page', 'upsert_skill'])

// File-mutating tools: the "this session did real work" signal. Claude Code names on the left,
// Codex on the right (apply_patch = its edit tool).
const WORK_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'apply_patch'])

// Brain as Code write-back: a repo-backed brain keeps its context as markdown under
// brain/{decisions,skills,wiki}/, so there the agent writes files instead of calling upsert_* — and
// that IS the write-back. Match a work-tool call whose serialized input touches that path (Claude
// Code's file_path and Codex's apply_patch body both stringify to contain it).
const BRAIN_FILE = /brain\/(?:decisions|skills|wiki)\/[^"'\s]*\.md/

// The bare tool name from either transcript dialect: strip a Claude Code `mcp__server__` prefix.
const bareName = (name) => (typeof name === 'string' ? name.split('__').pop() : '')

// Per-session marker path, so we nudge a session only once. Keyed by session_id (Claude Code),
// falling back to transcript_path (Codex/Cursor) — both are stable for the life of a session.
function markerPath(input) {
  const key = String(input.session_id || input.transcript_path || '').replace(/[^a-zA-Z0-9]/g, '_').slice(-120)
  return join(tmpdir(), `craftspace-stop-nudged-${key}`)
}

function allow() {
  process.exit(0)
}

function block(reason) {
  process.stderr.write(reason)
  process.exit(2)
}

// One pass over the transcript in whichever dialect it is. Returns the tool names called and whether
// a work-tool wrote a brain/ file (the Brain-as-Code write-back).
//   Claude Code: {message:{role:'assistant',content:[{type:'tool_use',name,input}]}}.
//   Codex: {type:'response_item',payload:{type:'function_call'|'custom_tool_call',name,arguments}}.
export function scanTranscript(lines) {
  const names = []
  let wroteBrainFile = false
  const brainWrite = (name, argsJson) => WORK_TOOLS.has(bareName(name)) && BRAIN_FILE.test(argsJson)
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
        if (block?.type === 'tool_use' && typeof block.name === 'string') {
          names.push(block.name)
          if (brainWrite(block.name, JSON.stringify(block.input ?? ''))) wroteBrainFile = true
        }
      }
    }
    const payload = entry.type === 'response_item' ? entry.payload : undefined
    if (payload && (payload.type === 'function_call' || payload.type === 'custom_tool_call') && typeof payload.name === 'string') {
      names.push(payload.name)
      if (brainWrite(payload.name, JSON.stringify(payload.arguments ?? payload.input ?? ''))) wroteBrainFile = true
    }
  }
  return { names, wroteBrainFile }
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

  let scan
  try {
    scan = scanTranscript(readFileSync(input.transcript_path, 'utf8').split('\n'))
  } catch {
    return allow()
  }
  const { names, wroteBrainFile } = scan

  // Write-back landed either way: an MCP upsert (hosted brain) or a file written into brain/ (Brain as Code).
  const wroteBack = wroteBrainFile || names.some((n) => WRITE_TOOLS.has(bareName(n)))
  if (wroteBack) return allow()

  // Only nudge when the session actually changed files (shipped something). Tool-call volume alone
  // (the old `names.length >= 6`) was too noisy — a read-heavy or brain-only session would trip it
  // and get blocked for "recording nothing" even when nothing hard-to-reverse happened.
  const didFileWork = names.some((n) => WORK_TOOLS.has(n) || WORK_TOOLS.has(bareName(n)))
  if (!didFileWork) return allow()

  // Nudge once per session: if we already blocked this session, let subsequent stops through.
  const marker = markerPath(input)
  try {
    if (existsSync(marker)) return allow()
    writeFileSync(marker, String(names.length))
  } catch {
    // Marker unavailable (read-only tmp, etc.) — fall through and still nudge; stop_hook_active
    // remains as the immediate loop guard.
  }

  return block(
    'Before you finish: this session did real work but recorded nothing to the Craftspace company ' +
      'brain. If this repo has a brain/ folder (Brain as Code), record the learning as a markdown file ' +
      'under brain/decisions/, brain/skills/, or brain/wiki/ (that IS the write-back — it rides your PR). ' +
      'Otherwise use the craftspace tools: a hard-to-reverse decision -> upsert_decision, a durable ' +
      'gotcha or learning -> upsert_page, a reusable procedure -> upsert_skill. Keep it tight — a few ' +
      'plain sentences, not an essay. Search first (grep brain/ or search_pages) so you extend rather ' +
      'than duplicate. If nothing here is genuinely worth keeping for the team, say so in one line and stop.',
  )
}

// Run only when invoked as the hook (node stop.mjs), not when imported by the self-test.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main()

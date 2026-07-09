#!/usr/bin/env node
// Cross-setup reliability test for Craftspace write-back.
//
// Drives each available CLI agent (Claude Code, Codex) headlessly with a DECISION task and a PAGE
// task whose subject carries a unique nonce, then asserts over the MCP that a record carrying that
// nonce now exists. It verifies the thing that actually matters: connected to the brain, does the
// agent reliably write the decision/learning back? Claude Code runs with the forcing hooks; Codex
// runs on the MCP nudge (it complies without hooks — see setups/README.md).
//
// Neither prompt mentions Craftspace or "record this" — the hooks and the server nudge are what
// drive the write, which is the whole point.
//
// Usage:
//   CRAFTSPACE_TEST_TOKEN=cst_… node setups/run-setup-tests.mjs [--only claude|codex] [--repeat N]
//
// The token is a cst_ member token (mint one in the web app). Never commit it. Records land in the
// real org and the MCP has no delete tool, so every test title is prefixed "[setup-test]" — delete
// them from the web app afterwards.

import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs'
import { tmpdir, homedir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HOOKS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'hooks')
const MCP_URL = process.env.CRAFTSPACE_MCP_URL ?? 'https://craftspace.app/mcp'
const TOKEN = process.env.CRAFTSPACE_TEST_TOKEN
if (!TOKEN) {
  console.error('Set CRAFTSPACE_TEST_TOKEN to a cst_ member token (mint one in the web app).')
  process.exit(2)
}

const args = process.argv.slice(2)
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null
const repeat = args.includes('--repeat') ? Number(args[args.indexOf('--repeat') + 1]) : 1

const onPath = (bin) => spawnSync('which', [bin]).status === 0
let counter = 0
const nonce = () => `st-${Date.now().toString(36)}-${counter++}`

// One MCP JSON-RPC call over the stateless HTTP endpoint (no session handshake needed).
async function mcp(method, params) {
  const res = await fetch(MCP_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
  const text = await res.text()
  // enableJsonResponse gives plain JSON; tolerate an SSE `data:` frame just in case.
  const json = text.trimStart().startsWith('{') ? text : text.split('\n').find((l) => l.startsWith('data:'))?.slice(5)
  return JSON.parse(json)
}

// Poll search_pages until a record carrying the nonce shows up (writes are effectively immediate).
async function recorded(nonceStr) {
  for (let i = 0; i < 4; i++) {
    const out = await mcp('tools/call', { name: 'search_pages', arguments: { query: nonceStr } })
    if ((out.result?.content?.[0]?.text ?? '').includes(nonceStr)) return true
    await new Promise((r) => setTimeout(r, 1500))
  }
  return false
}

const decisionPrompt = (n) =>
  `For the new service codenamed "${n}", decide whether it should use PostgreSQL or MySQL as its ` +
  `primary datastore. Pick one and write the choice with a one-line rationale into DB.md.`

const pagePrompt = (n) =>
  `While setting up the "${n}" service we hit a gotcha worth remembering: its health check must run ` +
  `before the migration step, or the container is killed mid-migrate. Note it in HEALTH.md.`

// --- Claude Code: self-contained (token MCP + shared forcing hooks, ignoring any installed plugin).
function runClaude(prompt, dir) {
  const mcpCfg = join(dir, 'mcp.json')
  const settings = join(dir, 'settings.json')
  writeFileSync(mcpCfg, JSON.stringify({ mcpServers: { craftspace: { type: 'http', url: MCP_URL, headers: { Authorization: `Bearer ${TOKEN}` } } } }))
  const hook = (f) => ({ hooks: [{ type: 'command', command: `node ${join(HOOKS_DIR, f)}` }] })
  writeFileSync(settings, JSON.stringify({ hooks: { SessionStart: [hook('session-start.mjs')], Stop: [hook('stop.mjs')] } }))
  return spawnSync(
    'claude',
    ['-p', prompt, '--mcp-config', mcpCfg, '--strict-mcp-config', '--settings', settings, '--dangerously-skip-permissions'],
    { cwd: dir, encoding: 'utf8', timeout: 300_000 },
  )
}

// --- Codex: token MCP in a throwaway CODEX_HOME. Rides the MCP nudge (complies without hooks).
function runCodex(prompt, dir) {
  const ch = join(dir, 'codexhome')
  mkdirSync(join(ch, 'sessions'), { recursive: true })
  const realAuth = join(homedir(), '.codex', 'auth.json')
  if (existsSync(realAuth)) copyFileSync(realAuth, join(ch, 'auth.json'))
  for (const f of ['models_cache.json', 'version.json']) {
    const p = join(homedir(), '.codex', f)
    if (existsSync(p)) copyFileSync(p, join(ch, f))
  }
  writeFileSync(
    join(ch, 'config.toml'),
    `[mcp_servers.craftspace]\nurl = "${MCP_URL}"\n[mcp_servers.craftspace.http_headers]\nAuthorization = "Bearer ${TOKEN}"\n`,
  )
  return spawnSync('codex', ['exec', '--dangerously-bypass-approvals-and-sandbox', '-C', dir, prompt], {
    cwd: dir,
    encoding: 'utf8',
    timeout: 300_000,
    env: { ...process.env, CODEX_HOME: ch },
  })
}

const SETUPS = [
  { id: 'claude', label: 'Claude Code', available: onPath('claude'), run: runClaude },
  { id: 'codex', label: 'Codex', available: onPath('codex'), run: runCodex },
].filter((s) => (only ? s.id === only : true))

const results = []
for (const setup of SETUPS) {
  if (!setup.available) {
    console.log(`- ${setup.label}: SKIP (CLI not on PATH)`)
    continue
  }
  for (let round = 0; round < repeat; round++) {
    for (const [kind, makePrompt] of [
      ['decision', decisionPrompt],
      ['page', pagePrompt],
    ]) {
      const n = nonce()
      const dir = mkdtempSync(join(tmpdir(), `craftspace-setuptest-${setup.id}-`))
      process.stdout.write(`- ${setup.label} / ${kind} (${n})… `)
      const proc = setup.run(makePrompt(`[setup-test] ${n}`), dir)
      if (proc.error) {
        console.log(`RUN ERROR: ${proc.error.message}`)
        results.push({ setup: setup.label, kind, ok: false })
        continue
      }
      const ok = await recorded(n)
      console.log(ok ? 'WROTE ✓' : 'NOT RECORDED ✗')
      results.push({ setup: setup.label, kind, ok })
    }
  }
}

console.log('\n=== Summary ===')
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.setup} / ${r.kind}`)
const failed = results.filter((r) => !r.ok).length
console.log(`\n${results.length - failed}/${results.length} passed.`)
process.exit(failed === 0 ? 0 : 1)

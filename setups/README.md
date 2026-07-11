# Agent setups: make write-back reliable, and test it

A bare MCP connection to Craftspace is advisory. The server ships read-first / write-back rules in
its `instructions`, but clients truncate them and nothing forces the agent to act, so a session can
make a real decision and finish having recorded nothing. These setups close that gap per client, and
`run-setup-tests.mjs` verifies the fix by actually driving each agent and checking the record landed.

## The two levers

1. **SessionStart hook** (`hooks/session-start.mjs`) — prints the house rules to stdout, which the
   client folds into context every session. The reliable channel the truncatable `instructions` are
   not.
2. **Stop hook** (`hooks/stop.mjs`) — on the first stop of a session that did real work but called no
   craftspace write tool, it blocks and tells the model to record the decision/learning now (or say
   in one line why nothing is worth keeping). Nudges once (`stop_hook_active` is the escape hatch),
   fails open, and understands both the Claude Code and Codex transcript formats. Blocks via exit
   code 2 + a stderr reason, which Claude Code, Codex, and Cursor all honor.

The hooks only *read* the transcript to decide whether to nudge — the agent still authors every
record by calling the MCP tool itself, so capture stays agent-driven (ADR 0041), and the hooks just
make sure it happens (ADR 0047).

3. **Native rules file** (`cursor/rules/craftspace.mdc`, `codex/AGENTS.md`) — a client's own
   always-on context file. This carries one specific pointer: *before acting on how this company does
   things, call `list_skills` and follow the matching skill.* A benchmark showed a bare MCP
   connection pulls the right skill only ~1/3 of the time (agents look only when a task obviously
   smells like company policy); with this pointer present it is reliable. The rules file is more
   robust than the SessionStart hook for this — it does not depend on the hook firing (Cursor's hook
   is GUI-only/unverified, and `codex exec` skips hooks), and it never goes stale because it tells the
   agent to call `list_skills` rather than materializing a skill list. Claude Code already gets this
   pointer from the plugin's SessionStart hook, so no rules file is needed there.

## Per client

| Client | MCP | Forcing hooks | Verified here |
|---|---|---|---|
| **Claude Code** | plugin bundles it (OAuth) | plugin's `Stop` + `SessionStart`, and they **fire under `claude -p`** | ✅ decision + page forced, headless + live e2e |
| **Codex** | `codex/config.example.toml` (OAuth or token) | `codex/hooks.json` → shared scripts, **interactive only** | ✅ decision via nudge (headless). ⚠️ `codex exec` does **not** fire hooks, so headless page/gotcha write-back isn't forced; the interactive TUI/desktop fires the hooks (same format Codex already runs for other memory tools) |
| **Cursor** | `cursor/mcp.json` | `cursor/hooks.json` → shared scripts | ⚠️ config provided, **not** run — Cursor is GUI-only, no headless CLI |
| **Claude.ai / Desktop** | custom connector (OAuth) | none — no hook surface | relies on the MCP nudge only |

**The key asymmetry:** Claude Code's `-p` (print) mode fires hooks, so write-back is *forced* even
headless. `codex exec` does *not* fire hooks (only interactive Codex does), so headless Codex leans on
the MCP nudge — which lands decisions reliably but not always a page/gotcha. In real interactive use,
every hook-capable client forces both.

- **Claude Code**: `claude plugin marketplace add abuaboud/craftspace-plugin && claude plugin install craftspace@craftspace`. The plugin is the packaged version of these same two hooks plus the MCP.
- **Codex**: merge `codex/config.example.toml` into `~/.codex/config.toml` and `codex/hooks.json` into
  `~/.codex/hooks.json` (replace the path placeholder). The hooks fire in the interactive TUI/desktop
  (not in `codex exec`), where they force the write-back the same way the plugin does for Claude Code.
  Even without them, Codex records decisions on the MCP nudge. Also merge `codex/AGENTS.md` into your
  `AGENTS.md` so the skills pointer is present even in `codex exec`, which skips hooks.
- **Cursor**: drop `cursor/mcp.json` and `cursor/hooks.json` into `~/.cursor/`, and
  `cursor/rules/craftspace.mdc` into `~/.cursor/rules/` (or the project's `.cursor/rules/`) for the
  native always-on skills pointer, which does not depend on the unverified hook. Hooks unverified;
  the rules file and MCP are standard Cursor config.
- **Claude.ai / Desktop**: add the custom connector; there is no client hook surface, so write-back
  rides the server nudge alone.

## Running the tests

```bash
CRAFTSPACE_TEST_TOKEN=cst_… node setups/run-setup-tests.mjs            # all detected CLIs
CRAFTSPACE_TEST_TOKEN=cst_… node setups/run-setup-tests.mjs --only codex --repeat 3
```

For each CLI on `PATH` (Claude Code, Codex) it runs a **decision** task and a **page** task whose
subject carries a unique nonce — neither prompt mentions Craftspace or "record this" — then asserts
over the MCP that a record carrying that nonce now exists. It exits non-zero if any write is missing.

Mint the token in the web app (Setup → member token). It never touches the repo; the harness reads
it from the environment. The test records land in the real org under `[setup-test]` titles, and the
MCP has no delete tool, so delete them from the web app afterward.

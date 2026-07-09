# Craftspace agent setups

Connects your coding agents to your team's [Craftspace](https://craftspace.app) company brain (shared
Pages, Skills, and Decisions over MCP) and makes sure decisions and learnings actually get written
back.

A bare MCP connection is advisory: agents routinely finish a session having made a real decision
without ever recording it. Two shared hooks fix that:

- **SessionStart** primes the read-first / write-back rules directly into context (not a truncatable
  server string).
- **Stop** blocks the end of a substantive session that recorded nothing and tells the model to
  record the decision (`create_decision`), note (`create_page`), or procedure (`create_skill`) — or
  explicitly decline. Nudges once, fails open, and understands both the Claude Code and Codex
  transcript formats.

## Claude Code

```bash
claude plugin marketplace add abuaboud/craftspace-plugin
claude plugin install craftspace@craftspace
```

The `plugin/` here bundles the MCP (OAuth on first connect) plus both hooks. Type `/mcp` and pick
**craftspace** to sign in right away.

## Codex

Merge [`setups/codex/config.example.toml`](setups/codex/config.example.toml) into `~/.codex/config.toml`
and [`setups/codex/hooks.json`](setups/codex/hooks.json) into `~/.codex/hooks.json` (replace the path
placeholder with your checkout path). Codex speaks HTTP MCP with OAuth (`codex mcp login craftspace`)
or a `cst_` member-token header.

## Cursor

Drop [`setups/cursor/mcp.json`](setups/cursor/mcp.json) and
[`setups/cursor/hooks.json`](setups/cursor/hooks.json) into `~/.cursor/`. Unverified — Cursor is
GUI-only with no headless CLI, so it isn't covered by the test harness.

## Claude.ai / Desktop

Add `https://craftspace.app/mcp` as a custom connector. There's no client hook surface, so write-back
rides the server's own nudge.

## Testing

[`setups/run-setup-tests.mjs`](setups/run-setup-tests.mjs) drives each installed CLI (Claude Code,
Codex) through a decision task and a page task and asserts the record landed. See
[`setups/README.md`](setups/README.md).

Nothing here is secret: just the public MCP endpoint and small hook scripts. The source of truth is
the Craftspace monorepo; this repo is the published mirror.

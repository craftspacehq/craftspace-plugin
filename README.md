# Craftspace plugin for Claude Code

Connects Claude Code to your team's [Craftspace](https://craftspace.app) company brain — shared Pages, Skills, and Decisions over MCP — and makes sure decisions and learnings actually get written back.

A bare MCP connection is advisory: agents routinely finish a session having made a real decision without ever recording it. This plugin adds two hooks that fix that:

- **SessionStart** primes the read-first / write-back rules directly into context (not a truncatable server string).
- **Stop** blocks the end of a substantive session that recorded nothing, and hands the model a directive to record the decision (`create_decision`), note (`create_page`), or procedure (`create_skill`) — or explicitly decline. It nudges once and is loop-safe.

## Install

```bash
claude plugin marketplace add abuaboud/craftspace-plugin
claude plugin install craftspace@craftspace
```

The first time the `craftspace` MCP server connects, your browser opens to sign in. To sign in right away, type `/mcp` in Claude Code and pick **craftspace**.

## What's inside

- `plugin/.mcp.json` — the Craftspace MCP server (`https://craftspace.app/mcp`, OAuth).
- `plugin/hooks/` — the SessionStart and Stop hooks (dependency-free Node scripts).

Nothing here is secret: just the public MCP endpoint and two small hook scripts.

## Headless / CI

In non-interactive runs OAuth can't open a browser. Authenticate the `craftspace` MCP once interactively first, or point an MCP client at `https://craftspace.app/mcp` with a member token (`Authorization: Bearer cst_…`) minted in the Craftspace web app.

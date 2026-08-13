# AGENTS.md — Craftspace

Merge this into your project's `AGENTS.md` (or `~/.codex/AGENTS.md` for a global
rule). Codex reads `AGENTS.md` into context on every run, so it is the native,
always-on channel for the standing rule — more robust than a SessionStart hook,
which `codex exec` does not fire.

## Company skills (craftspace)

You are connected to this org's brain via the "craftspace" MCP server. Before
acting on how this company does anything (support replies, expense reports,
release notes, refunds, any internal procedure), call `list_skills` first and,
if one matches, `read_skill` and follow it exactly.

Skill bodies stay live on the MCP; nothing is materialized locally, so nothing
goes stale. Register the MCP itself via `setups/codex/config.example.toml`.

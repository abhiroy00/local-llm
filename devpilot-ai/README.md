# DevPilot AI

**Your Code. Your Machine. Your AI.**

Version 0.3.1 is a local-first agent preview with release-hardening fixes. Start Ollama, open your actual project folder in VS Code, Refresh and select an installed model.

- Chat: messages only.
- Plan: read/search allowed workspace files and propose a plan.
- Agent: bounded multi-step tasks with per-file diff approval and separate command approval.

Use Execute Plan after reviewing a plan. Stop cancels future work; earlier edits remain. Revert Last Change previews a session revert. Keep Git backups. Small models work best on narrow tasks.

16 validated tools cover listing/reading/search, symbols, dependencies, workspace info, create/edit/patch/delete, commands/tests, Git status/diff and optional semantic retrieval. Tools require workspace trust. Paths target the active editor's workspace folder, otherwise the first folder. Index Workspace builds an allowed-file inventory.

Limits: 8 agent steps; duplicate detection; 2-minute model calls; 10-minute task deadline; commands time out at 60 seconds. Reads are UTF-8 up to 128 KiB, with tool excerpts capped at 12000 characters. Listing caps at 1500 files/10000 entries; text search scans up to 200 files/30 matches. Secret filename rules and ignore/link checks apply; arbitrary source text is not automatically redacted.

Optional devpilot.embeddingModel uses a separately installed embedding model, at most 48 files/1800 characters per file in session memory. No model is downloaded automatically.

## Development

Run npm ci, npm run check, and optionally npm run smoke:agent (requires qwen2.5-coder:3b). Run npm run package for a versioned VSIX, SHA-256 checksum and inventory report. Open this folder or the repository root, select Run DevPilot AI and press F5. The webview uses the root lockfile. CHANGELOG.md lists release fixes.

See INSTALLATION.md, DEVELOPMENT.md, SECURITY.md, ARCHITECTURE.md, ROADMAP.md and VALIDATION.md. This is a tested preview, not production parity with other coding agents.

# Current integration status — 0.6.2

Implemented: right-hand sidebar, local Ollama chat and agent loop, free DeepSeek setup, low-memory defaults, 25 validated workspace/code/process tools, plans, diagnostics/navigation, approved file edits and commands, persistent task checkpoints, aggregate review, grouped undo, saved conversations, bounded dev processes and evidence-based execution records, inline file-change scope enforcement and stricter test-command evidence.

Verified locally: automated regression suite, native Mac create/edit/reject/undo/command integration, multi-file checkpoints, real HTTP server readiness/stop, and real Qwen 3B single- and two-source-file arithmetic repair/test/undo trials, plus automated rendered-sidebar approval/undo interaction. See VALIDATION.md for the still-failing string-task model trial and exact limitations.

Remaining: reliable larger-project autonomous coding, Windows real-model and native UI coverage, interactive sidebar approval-card testing, per-hunk approval, MCP integrations, web research and broader model/performance evaluation. Windows/Linux CI passed on the user-authorized verification branch, including actual Windows native editor acceptance. No merge or deployment. This release does not claim full Claude Code/Codex parity.

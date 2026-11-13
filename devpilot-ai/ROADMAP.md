# Phase status

1. Foundation implemented; user screenshot confirmed sidebar launch.
2. Local chat implemented; real qwen2.5-coder:3b inference verified.
3. Bounded workspace intelligence implemented: file/search/symbol/dependency/editor tools, filters and ephemeral inventory. Real model read_file orchestration passed.
4. Coding tools implemented: create/edit/delete/patch, diff approval, stale checks and session revert. Approval/refusal/conflict unit tests pass; native interaction, per-hunk selection and durable backups remain.
5. Agent core implemented: Plan/Agent, Execute Plan, schema decisions, bounded loop/context, cancellation/refusal stop, error feedback and timeline. Real read-only Qwen task passed; general coding reliability is not benchmarked.
6. Advanced core implemented: approved commands/tests, cancellation/deadlines, filtered Git status/diff, debugging/test prompts and optional bounded semantic retrieval. Local persistence retains conversations, semantic vectors, undo records and a bounded audit log. SQLite migration, Tree-sitter analysis, ripgrep acceleration and comprehensive Git summaries remain deferred.
7. Release verification in 0.3.1: 34 tests, stricter approval/undo/CRLF handling, expanded typed native harness, versioned package inventory/checksums and Windows/Linux CI configuration. VSIX CLI installation is verified in an isolated directory. Production readiness remains pending: native host execution is still blocked by the updater mutex; interactive approvals/cancellation, remote CI and performance/model matrix need validation.

This is an agent preview, not a claim that every master-prompt feature/acceptance criterion is complete. No automatic commit, push or deploy.

## Master prompt program (registered 2026-11-13)

The autonomous coding/computer-use master prompt is tracked as a batched program, not a single change. The code-verified audit, dependency map and batch definitions live in `docs/DEVPILOT_AUDIT.md`.

- Phase A (audit): complete 2026-11-13 — 16 tools, 44 tests, no browser/desktop/attachment/vision/MCP/multi-agent code found.
- B1 (provider seam + engine hardening): in progress. One-retry decision recovery is implemented; provider seam, per-step budget, usage accounting and resumable task history remain.
- Wave 1 safety follow-up: heuristic secret redaction and a persistent, user-clearable audit log are implemented; chain-aware reapproval after sensitive-file edits remains.
- B2–B12 (IDE tools, transactions, process manager, attachments, vision, browser, desktop, memory/multi-agent, MCP, UI, optional cloud): not started.

A batch is only marked complete when its code, tests and documentation ship together; nothing above is claimed as implemented before that.

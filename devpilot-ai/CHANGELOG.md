# Changelog

## Unreleased

- Retry one malformed or schema-invalid Agent decision with corrective feedback; fail explicitly if the repair is still invalid.
- Add heuristic credential redaction for model context, tool results and persisted content; block edits to files containing detected credentials and warn on executable configuration edits.
- Persist a bounded, redacted tool/approval audit log with Show and confirmation-gated Clear commands.
- Extend Ollama model discovery to 30 seconds and replace raw abort-timeout errors with an actionable local-server message.
- Remove the fixed 2-minute cap on agent model calls so the documented task deadline governs Plan/Agent runs; slow local models no longer fail mid-plan with a raw transport timeout.
- Reject an Agent-mode final answer that skipped every tool call: the model is nudged back to a real tool action, and a task that still claims completion without touching the workspace now fails with an explicit message instead of "Task completed."

## 0.3.1 — 2026-11-12

Release verification and hardening:

- Reject npm approval if package.json changes during review.
- Protect unsaved editor content even when a target file is absent on disk; recheck after approval.
- Preserve all 20 retained undo records and avoid recording a revert as a new edit.
- Hash/back up actual saved bytes so Windows CRLF conversion does not break revert.
- Report Git changes when the workspace is a subfolder of the repository, while filtering secret files.
- Expand regression tests and native-host test scenarios; typecheck the host harness.
- Package using the manifest version, verify inventory and generate SHA-256/report files; omit development source maps.
- Add Windows/Linux GitHub Actions checks and artifact packaging (not yet run remotely).

Native Extension Host execution is still blocked by the local VS Code updater lock. The new native edit/revert scenarios are written/typechecked, not claimed to have passed. Interactive approval-card validation remains pending.

## 0.3.0

Agent preview with workspace tools, Plan/Agent modes, per-change approvals, bounded execution, approved terminal/tests and optional semantic retrieval. See ROADMAP.md for scope limits.

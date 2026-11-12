# Changelog

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

# Validation — 0.6.1 (2026-11-14)

## Passed

- TypeScript for host, webview, native harness and sidebar tests; ESLint; 114 local unit/DOM tests; production build. The native CI hook passes when invoked locally and runs automatically on GitHub Windows workers.
- [Windows/Linux CI passed](https://github.com/abhiroy00/local-llm/actions/runs/43582200815) on verification commit `b4ea9ed86715bd1f236728e52b42901e4ff22acc`. Windows: 115 tests in 14 files passed, including actual native VS Code acceptance, production audit (0 vulnerabilities), build and VSIX packaging. Linux checks passed too. Native Windows reported build `2d552e9919d6`; the Mac package reports `87935e1b0a3f` (platform checkout/build inputs differ).
- Four React DOM/jsdom interaction tests exercise the rendered controls through the actual host message parser/approval handler. They cover mismatched approval IDs, Reject/Run buttons, actual failing-exit display, Stop cancellation, Plan blocking, checkpoint review/process-stop messages, and reviewed two-file undo through FileEditor with real disposable files. Rejection preserves the edited bytes; two matching approvals restore both original files.
- The original two-file arithmetic trial passed on the release candidate: real Qwen 3B low-memory inference edited both source files, four tests passed, an independent rerun passed, and grouped undo restored exact original bytes and failing tests. The test file and package script were unchanged. Fixture approvals remain explicit harness callbacks.
- Native Mac activation/sidebar registration, allowed reads, blocked Plan/secret access, rejected creation, WorkspaceEdit changes/undo, commands and actual loopback HTTP readiness/stop remain part of every coding trial.
- Unit tests cover current-path/hash ownership in one-file proposals, malformed/out-of-scope rejection, baseline/verification sequencing, refreshed-source bounded repair, assertion compaction, and root/nested/oversized guidance.

## Open failures and external verification

The harder string-processing task still fails with Qwen 3B: it produced incorrect content or repeated calls even with the correct file reads. Several attempted protocols/repairs are retained in `artifacts/acceptance-0.6.1.json`; no broad model reliability or Claude Code/Codex parity is claimed. Only small-file staged repairs were added; arbitrary large repositories still use the existing bounded tool loop.

Native desktop control was retried and its control kernel reset. It still reports “native pipe startup failed” and cannot enumerate apps/browsers. Rendered DOM tests are not native screen/approval-card click verification. The user was given official Computer Use setup/permission guidance; an app-side reconnection is still needed.

The user authorized a test-branch commit/push and CI execution. The CLI could not update workflow files with its current OAuth scope, so the verification branch retains the existing workflow and runs native Windows acceptance through the normal npm-check test suite. The native result is printed in CI logs; the Windows VSIX, checksum and inventory were downloaded and independently verified. No merge or deployment occurred. Windows real-model inference and native UI clicks were not tested.

`npm audit` reports 10 moderate advisories in existing development tooling (minimatch and its dependents), not the new DOM dependency chain. No forced upgrades or major-version downgrades were applied.

Reproduce the original case with `npm run smoke:coding -- qwen2.5-coder:3b --multi`; the broader failing case with `--strings`. Run one low-memory model trial at a time. Native reports are saved in `artifacts/native/`; all fixtures are disposable and Little-Learners-2 is untouched.

---

# Validation — 0.6.0 (2026-11-14)

## Verified locally

- `npm run check`: extension, React UI and native-harness TypeScript, ESLint, 104 automated tests in 12 files, and production build.
- New tests cover persisted multi-file checkpoints, stale-task preflight before any undo, rejection/resume, complete-group retention, the 20-edit task cap, named-file preparation, retained/current file hashes and one bounded loop recovery.
- Real child-process tests cover rejected/stale script approvals, bounded Unicode output, duplicate-process exclusion, failure exit codes, cancellation, lifetime expiry and stop.
- Native macOS VS Code acceptance passed: secondary-sidebar/command registration, allowed reads, blocked Plan writes and secrets, rejected creation, actual WorkspaceEdit create/replace/undo, multi-file task undo, approved commands, and real HTTP readiness on a disposable loopback server followed by stopped-tree/closed-port verification.
- Real local Qwen 2.5 Coder 3B in low-memory mode passed the single-file calculator acceptance: failing baseline, model-applied edit, passing approved test, independent passing rerun, byte-exact undo and failing tests restored. Test source and package script are asserted unchanged in the final harness. Approvals use a fixture callback, not sidebar clicks.

## Failed and unverified acceptance

Three harder two-source-file model trials failed: the initial trial edited only the add function and then looped; focused initial reads obtained all requested files but still looped without edits; one bounded recovery still left the multiply repair incomplete and tests failing. These failures are retained in `artifacts/acceptance-0.6.0.json`. A single-file success does not establish general multi-file coding reliability. The last small evidence fix invalidates old source excerpts after an approved edit; no multi-file pass is claimed.

Desktop approval-card testing was attempted in an isolated profile. The computer-use native pipe disconnected before the isolated window could be selected. The disposable launcher/window was stopped and cleanup checked. Sidebar interaction, aggregate-diff clicks and grouped undo through UI are not verified. Native harness approvals remain explicitly test callbacks.

Windows branches are unit tested and native CI is configured; this Mac cannot establish a native Windows pass. Remote CI has not run for these uncommitted changes. Heavy DeepSeek 6.7B/8B inference was not retried after the earlier hang. Larger repositories, long tasks, per-hunk approval, MCP/web integrations and Claude Code/Codex parity remain unfinished or unverified.

Reproduce: `npm run test:host`, `npm run smoke:coding -- qwen2.5-coder:3b`, or `npm run smoke:coding -- qwen2.5-coder:3b --multi`. Real model runs require Ollama and the installed model. Use one run at a time in low-memory mode. Fixtures use fresh temporary workspaces; Little-Learners-2 is not used or modified.

---

# Validation — DeepSeek/Windows integration 0.5.0 (2026-11-13)

## Verified

- `npm run check`: TypeScript, ESLint, 10 files / 73 tests and production build pass after recovery changes. These checks do not run model inference.
- DeepSeek Coder 6.7B quantized download completed and was listed by local Ollama. Download success is not inference/coding validation.
- Native Mac extension integration passed before the interrupted real-model coding test, verifying view/command registration, approved create/replace/revert and command execution through a fixture approval callback. It was not rerun after the reported system hang.
- Tests cover catalog/source restrictions, cancellable downloads, partial/error streams, reasoning filtering, missing final answers, Windows/POSIX process specifications, low-memory inference limits, heavy-model/context guards and compact response grammars with runtime validation retained.

## Interrupted and unverified

The user reported the machine hung during the first real DeepSeek 6.7B native coding smoke and closed it. No passing result is claimed. The exact cause is unconfirmed. The test harness used unbounded verbose editor log capture; response grammars also contained large bounds. Log output is now capped at 256 KiB without verbose mode, process-tree cleanup is added, real-model tests are capped at three minutes, and response grammar bounds are simplified while runtime Zod limits remain enforced. No leftover test or Ollama runner was found during recovery.

No further live model inference was run after the hang. Coder 1.3B is the conservative 16 GB default, not a demonstrated coding-quality result. The larger catalog models are blocked in low-memory mode; explicit Balanced mode remains unvalidated on this Mac. Resource caps cannot guarantee absence of memory pressure or hangs.

Windows process branches are unit tested and native Windows/macOS CI jobs are configured with an isolated official editor downloader. The remote workflow has not run for these uncommitted changes, so no native Windows pass is claimed. UI download-card clicks, R1 inference, larger-project coding reliability and full Claude Code/Codex parity remain unverified or unfinished.

---

# Validation — coding agent 0.4.0 (2026-11-13)

## Verified in this checkout

- Apple Silicon macOS, arm64 Node 24.21.0.
- `npm run check`: TypeScript (extension/UI/native harness), ESLint, 9 test files / 55 tests, and production build passed.
- New regressions cover follow-up context, configured step limits, full production catalog/context budget, malformed-decision recovery, invalidating test evidence after another edit, language navigation filtering, document symbols, diagnostics filtering, ranged reads with CRLF preservation, unique targeted replacements and validated task plans.
- `npm run smoke:agent`: real local `qwen2.5-coder:3b` selected `read_file`, inspected a temporary fixture, and explained its actual exported value 42 in two model decisions. This remains a read-tool test, not a coding benchmark.
- `npm run test:host`: isolated native VS Code integration passed on macOS. It verifies extension activation/sidebar opening, file listing/reading, blocked Plan writes/secrets, rejected create, approved create/edit/revert and approved command execution. Approvals use a fixture callback, not sidebar clicks.

## Remaining verification and scope

Interactive clicks on the redesigned approval cards, narrow/light-theme layouts, attachments, language-provider behavior across languages, cancellation races and general model coding reliability need wider manual verification. The real model smoke does not test autonomous writes. Additional toolchain commands are validated by tests; Cargo/Go/Swift/.NET builds were not run against real projects. macOS was added to CI configuration, but remote workflow execution has not been verified. No new dependency audit is claimed.

The extension contributes to the Secondary Side Bar using the stable VS Code 1.106+ contribution point. Previous user-positioned views may keep their saved location; use Move View or reset view location if needed. No MCP servers, cloud providers, arbitrary shell execution, background terminals, web research, partial-hunk approval, Git mutations or deployment were added. The preview retains local-only inference and explicit approval policies. Activity shows bounded approved output/diff excerpts; saved conversations, vectors and undo remain unencrypted local JSON.

---

## Historical 0.3.1 report

# Validation — agent preview 0.3.1 (2026-11-12)

## Passed

- Latest npm run check after local persistence: host/UI/native-harness TypeScript, ESLint, 9 test files / 42 tests and production build passed.
- New release regressions cover changed npm manifests during approval, unsaved new-file editors, full-capacity undo, Windows CRLF saved hashes/revert, and real Git status/diff filtering from a nested workspace.
- Versioned packaging now validates its inventory, omits source maps, and writes SHA-256 and package-report files. Windows/Linux CI is configured locally but has not run on GitHub.
- Tests cover endpoint/message validation, streaming UTF-8/NDJSON, cancellation, model discovery, context bounds, workspace ignores/traversal/device names, binary/link exclusions, literal search, schema decisions, loop/refusal stops, approval request IDs/cancellation, command allowlists, diff refusal/stale/dirty-file checks, patch path checks and semantic ranking/stale entries.
- Persistence tests verify conversation, vector and undo-record reloads, 100-conversation retention, workspace/model isolation, and undo after reopening storage.
- The real HTTP transport test uses a loopback protocol fixture, not a model.
- npm run smoke:agent passed with the installed qwen2.5-coder:3b: model selected read_file, inspected a temporary TypeScript fixture and explained its actual hello = 42 content over two decision steps. This is a read-tool smoke test, not an autonomous coding benchmark.
- Real local chat inference also passed earlier.
- npm audit --omit=dev: zero vulnerabilities. Full audit: 10 moderate findings in ESLint/typescript-eslint/minimatch/vsce development tooling, no high/critical findings.
- VSIX creation succeeded. CLI installation into a temporary isolated extension directory succeeded. Package inventory excludes node_modules, source/tests/scripts, models and smoke bundles.
- The user visually confirmed the earlier sidebar launch.

## Blocked/pending

The isolated native Extension Host integration harness was retried during 0.3.1 verification. VS Code again exited 1: checkInnoSetupMutex reported vscode-updating still held after approximately 30 seconds, followed by "Code is currently being updated. Please wait for the update to complete before launching." Latest log: C:/Users/abhis/AppData/Local/Temp/devpilot-host-EqEyra/host.log. No native host test success is claimed. The expanded native create/edit/revert/command scenarios are written and typechecked only. After the update finishes, npm run test:host auto-detects the standard Windows VS Code installation; VSCODE_EXECUTABLE can override it.

Latest Plan/Agent UI, approval cards, diff acceptance/rejection, Stop, revert and real project tests need interactive smoke verification. FileEditor approval tests use mocked VS Code APIs and do not substitute for those checks. Optional semantic retrieval has fixture tests; no embedding model was downloaded or real-tested.

## Scope

A bounded agent preview, not production readiness or complete master-prompt parity. Single-file approval; no partial-hunk selection. Persistence tests cover conversations (latest 100 per workspace), semantic vectors and the last 20 undo records in VS Code extension storage. Stored data is unencrypted local JSON; this is not SQLite. Tree-sitter grammar index, ripgrep acceleration, automatic Git mutations or deployment are not implemented. Filesystem race and script-execution caveats are documented in SECURITY.md.

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

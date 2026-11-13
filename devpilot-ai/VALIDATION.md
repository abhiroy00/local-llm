# Validation — agent preview 0.3.1 (updated 2026-11-14)

## Passed

- Pre-follow-up npm run check after local persistence: host/UI/native-harness TypeScript, ESLint, 9 test files / 42 tests and production build passed.
- New release regressions cover changed npm manifests during approval, unsaved new-file editors, full-capacity undo, Windows CRLF saved hashes/revert, and real Git status/diff filtering from a nested workspace.
- Versioned packaging now validates its inventory, omits source maps, and writes SHA-256 and package-report files. Windows/Linux CI is configured locally but has not run on GitHub.
- Tests cover endpoint/message validation, streaming UTF-8/NDJSON, cancellation, model discovery, context bounds, workspace ignores/traversal/device names, binary/link exclusions, literal search, schema decisions, loop/refusal stops, approval request IDs/cancellation, command allowlists, diff refusal/stale/dirty-file checks, patch path checks and semantic ranking/stale entries.
- Persistence tests verify conversation, vector and undo-record reloads, 100-conversation retention, workspace/model isolation, and undo after reopening storage.
- The real HTTP transport test uses a loopback protocol fixture, not a model.
- A temporary smoke probe with qwen2.5-coder:7b passed: model selected read_file, inspected a TypeScript fixture and explained its actual hello = 42 content over two decision steps. The repository smoke command's qwen2.5-coder:3b default is not installed and is blocked. This is a read-tool smoke test, not an autonomous coding benchmark.
- Real local chat inference also passed earlier.
- npm audit --omit=dev: zero vulnerabilities. Full audit: 10 moderate findings in ESLint/typescript-eslint/minimatch/vsce development tooling, no high/critical findings.
- VSIX creation succeeded. CLI installation into a temporary isolated extension directory succeeded. Package inventory excludes node_modules, source/tests/scripts, models and smoke bundles.
- The user visually confirmed the earlier sidebar launch.
- Wave 1 follow-up `npm run check`: typecheck, lint, 10 test files / 63 tests and build passed. Tests cover one-retry decision recovery, heuristic secret redaction, sensitive-file approval warnings, persistent audit redaction/retention/clear, and timeout messaging.
- `npm run smoke:agent` is blocked on this machine because its default `qwen2.5-coder:3b` is not installed; a temporary 7b probe passed in the earlier audit.

## Blocked/pending

The host integration result has varied across prior runs: an earlier 0.3.1 attempt was blocked by the VS Code updater mutex; a later audit reported a pass. It was not rerun for this follow-up, so new audit commands are typechecked and manifest-tested but not confirmed in a live Extension Host. Avoid overwriting the pre-existing dirty packaging artifacts when packaging.

Latest Plan/Agent UI, approval cards, diff acceptance/rejection, Stop, revert and real project tests need interactive smoke verification. FileEditor approval tests use mocked VS Code APIs and do not substitute for those checks. Optional semantic retrieval has fixture tests; no embedding model was downloaded or real-tested.

## Scope

A bounded agent preview, not production readiness or complete master-prompt parity. Single-file approval; no partial-hunk selection. Persistence tests cover conversations (latest 100 per workspace), semantic vectors and the last 20 undo records in VS Code extension storage. Stored data is unencrypted local JSON; this is not SQLite. Tree-sitter grammar index, ripgrep acceleration, automatic Git mutations or deployment are not implemented. Filesystem race and script-execution caveats are documented in SECURITY.md.

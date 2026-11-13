# DevPilot AI — Test Execution Record

Initial audit: 2026-11-13 · implementation follow-up: 2026-11-14 · version 0.3.1

This file records exactly what was executed, what passed, what failed, and what could not be executed. No result here is estimated or copied from documentation.

## Environment

| Item | Value |
| --- | --- |
| OS | Windows (win32) |
| Node.js | v24.20.0 (project requires `>=22`) |
| npm | 11.19.0 |
| VS Code | 1.146.0 (Extension Host used by `test:host`) |
| Ollama | running at `http://localhost:11434` |
| Installed models | `qwen2.5-coder:7b` only |
| Embedding model | none installed |
| Vision model | none installed |

## Executed checks

| # | Command | Exit | Result | Notes |
| --- | --- | --- | --- | --- |
| 1 | `npm run typecheck` | 0 | **PASS** | host, webview and host-test projects |
| 2 | `npm run lint` | 0 | **PASS** | ESLint over `src`, `webview-ui/src`, `tests` |
| 3 | `npm test` | 0 | **PASS** | 9 files, 44 tests, 2.14 s |
| 4 | `npm run build` | 0 | **PASS** | extension 897,290 B; webview 531,791 B; css 13,196 B |
| 5 | `npm run test:host` | 0 | **PASS** | `{passed:true, commands:true, webviewOpened:true, workspaceRead:true, planWriteBlocked:true, secretsBlocked:true, rejectedCreate:true, acceptedCreateEditRevert:true, approvedCommand:true}` |
| 6 | `npm run package` | 0 | **PASS** | 18 files, 337.26 KB, SHA-256 `aae3350cda058c48deb7b9feb704e9924356480a8020a2bec13ecbf7ad4c0937` |
| 7 | `npm audit --omit=dev` | 0 | **PASS** | 0 vulnerabilities |
| 8 | `npm run smoke:agent` | 1 | **BLOCKED** | see below; missing model, not a code failure |
| 9 | temp-copy agent smoke with `qwen2.5-coder:7b` | 0 | **PASS** | `read_file` executed; answer: "`fixture.ts` exports a constant named `hello` with the value `42`" |
| 10 | `npm run check` (follow-up) | 0 | **PASS** | typecheck, lint, build and 10 files / 63 tests |

The follow-up did not rerun the Extension Host, packaging, dependency audit or model smoke. The host/package results above are from the initial audit; packaging was not repeated because artifacts were already dirty.

### Unit test breakdown (check 3)

| File | Tests | Result |
| --- | --- | --- |
| `tests/approval.test.ts` | 2 | PASS |
| `tests/messages.test.ts` | 4 | PASS |
| `tests/index.test.ts` | 3 | PASS |
| `tests/ollama.test.ts` | 6 | PASS |
| `tests/workspace.test.ts` | 4 | PASS |
| `tests/ollama-http.test.ts` | 1 | PASS |
| `tests/agent.test.ts` | 7 | PASS |
| `tests/persistence.test.ts` | 3 | PASS |
| `tests/tools.test.ts` | 14 | PASS |

## Failed / blocked execution

### B-01 — Agent smoke uses a model that is not installed (BLOCKED)

Command: `npm run smoke:agent`
Exit: 1

```
Step 1/8: deciding next action
Error: Ollama model or API not found. Refresh models and select an installed chat model.
    at OllamaService.request (dist/agent-smoke.cjs)
    at OllamaService.structured
    at AgentService.run
```

Root cause: `scripts/agent-smoke.ts` hardcodes `qwen2.5-coder:3b`. The local Ollama only has `qwen2.5-coder:7b`, so `/api/chat` returns HTTP 404, which `OllamaService.request` maps to the model/API message above.

Classification: **BLOCKED**, not FAILED. The failure occurs before any agent decision, and the same code path passes with an installed model (check 9). It is also a test-infrastructure gap: the smoke script accepts no model override.

Evidence that the underlying behavior is healthy: a temporary copy of the smoke script with only the model name changed (bundled with esbuild into a temp directory; no project source edited) completed successfully with `read_file` and a grounded answer.

### B-02 — Semantic search live execution (BLOCKED)

`search_semantic` requires `devpilot.embeddingModel` to name an installed embedding model. None is installed, and the setting defaults to empty. Unit tests verify ranking, stale-input filtering and persisted vector reuse with a mocked embedder, but no live embedding call was executed.

### B-03 — Vision / browser / desktop / document checks (NOT EXECUTED)

There is no implementation, so no test exists and none could be run. These are not failures; they are unimplemented areas (see `IMPLEMENTATION_STATUS.md`).

## Checks that could not be executed

| Check | Reason | Status |
| --- | --- | --- |
| Approval **UI** click-through | No webview DOM automation harness; host test uses the approval callback | NOT EXECUTED |
| `run_tests` tool end-to-end | No test invokes it; would run the project's own suite recursively | NOT EXECUTED |
| `delete_file` tool | No unit or host test references it | NOT EXECUTED |
| `search_symbols` | Needs a live language provider; only available inside VS Code with a language extension | NOT EXECUTED |
| `get_workspace_info`, `inspect_dependencies` | No test references them | NOT EXECUTED |
| 60s terminal timeout and process-tree kill | No test exercises the timeout path; cancellation is tested | NOT EXECUTED |
| Latest GitHub Actions run | No credentials/API access to Actions history; config inspected only | BLOCKED |
| Coverage report | No coverage provider configured | NOT EXECUTED |
| Browser / desktop / MCP / multi-agent suites | Features absent | NOT APPLICABLE |
| Real vision-model inference | No vision model installed | BLOCKED |

## Side effects of running the requested checks

- `dist/extension.js`, `dist/webview.js`, `dist/webview.css` were rebuilt.
- `artifacts/devpilot-ai-0.3.1.vsix`, its `.sha256` and `artifacts/package-report.json` were regenerated, so the checksum differs from the pre-audit file.
- No file under `src/`, `webview-ui/`, `tests/` or `scripts/` was modified.
- The agent smoke run wrote `dist/agent-smoke.cjs` (build artifact, excluded from the VSIX).

## Test-quality gaps found

1. `scripts/agent-smoke.ts` hardcodes a model; add an env override (`DEVPILOT_SMOKE_MODEL`) and fail with a clear "install this model" message.
2. No test covers the 60s terminal timeout or process-tree kill.
3. `delete_file`, `run_tests`, `search_symbols`, `get_workspace_info` and `inspect_dependencies` have no tests.
4. Approval is tested through a callback, not through the webview card.
5. No webview interaction tests at all (streaming, mode switch, conversation switch, stop).
6. No tests for multi-file edits because the feature does not exist.
7. No archive/upload security fixtures (zip-slip, polyglot files) because attachments do not exist.

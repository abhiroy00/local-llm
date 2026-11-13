# DevPilot AI — Pending Tasks (Prioritized)

Updated: 2026-11-14 · prioritized follow-up to the 2026-11-13 audit

119 requirements remain incomplete: 107 not implemented, 10 partial, 2 blocked. This document prioritizes the remaining work. Requirement IDs refer to `docs/IMPLEMENTATION_STATUS.md`.

Priority rules used: **Critical** = data loss, security exposure, task failure, or blocks everything else; **High** = core master-prompt capability or a hard dependency for several areas; **Medium** = important but independently deliverable; **Low** = optional/deferred or explicitly out of scope.

## Critical

| # | Task | IDs | Why | Acceptance |
| --- | --- | --- | --- | --- |
| 2 | **Sensitive-file permission tier (partial)** — executable configuration gets a distinct warning/action, but no extra post-edit command-chain gate | P8 | Editing project scripts and then approving a command remains a supply-chain risk | Add a chain-aware re-prompt after sensitive edits; test the sequence |
| 5 | **Per-step deadline from remaining budget** — compute each model call's deadline from the remaining task time; surface "step timed out, retrying/narrowing" instead of one silent 10-minute abort | A14 | One slow call can consume the entire task with no progress signal | Tests with fake timers: remaining budget respected; task reports which step stalled |

## High

| # | Task | IDs | Why | Acceptance |
| --- | --- | --- | --- | --- |
| 6 | Provider interface + `OllamaProvider`; agent depends on the interface | A10 | Blocks cloud models, vision routing, per-agent model choice; prerequisite for multi-agent | Existing 44 tests pass unchanged; a fake provider can drive one agent run |
| 7 | Usage/token accounting for agent steps and UI display | A15 | Users cannot see cost/context pressure during agent runs | Per-step usage recorded and shown; chat behaviour unchanged |
| 8 | Persist execution history and task outcome | A16 | Enables audit, resume and honest reporting | Reload shows last task's steps; bounded |
| 9 | Checkpoint/resume for interrupted tasks | A13 | Agent work is lost on reload/crash | Task state persisted after each step; resume continues or fails explicitly |
| 10 | Diagnostics-aware fixing (`languages.getDiagnostics`, `executeDocumentSymbolProvider`, references) | B14, B16 | Without compiler feedback the agent fixes blind | New tools return bounded diagnostics; unit tests with VS Code mock; host test with a real file |
| 11 | Multi-file transaction with grouped rollback | B12, B13 | Real features span several files; current undo is linear per file | Two-file edit applies atomically; one revert restores both; failure leaves no partial state |
| 12 | Attachment pipeline: image + file upload, validation, text extraction, context injection, composer UI | F1–F5, G1–G6 | Blocks vision, documents and screenshot analysis; also required for "analyze this screenshot" workflows | Upload fixtures parse; oversized/binary rejected; CSP updated for `blob:`/`data:` only; tests |
| 13 | Process manager: background jobs, ports, health, bounded logs, stop | D7–D10 | Needed for dev servers, browser previews and visual verification | Fixture server starts, reports port, streams bounded logs, stops with tree kill |
| 14 | Browser engine (Playwright): session, navigation, interaction, extraction, screenshots, logs, domain policy | J1–J12 | Core computer-use capability and prerequisite for visual verification | Local fixture: navigate → fill → click → extract → screenshot; blocked domain rejected; no bundled browser binaries |
| 15 | Smoke-test model override and clear missing-model error | T9, T8 (blocked) | `npm run smoke:agent` cannot pass on a machine without the hardcoded 3b model | `DEVPILOT_SMOKE_MODEL` respected; missing model prints install instructions |
| 16 | Approval UI automation (webview) | P15 | The most safety-critical interaction is only tested through a callback | One automated flow: approval card visible → reject → no file change |
| 17 | Live embedding verification | B5, N4 (blocked) | Semantic search is only mock-tested; no embedding model installed | With an installed embedding model, index + query returns a real match; document the model requirement |

## Medium

| # | Task | IDs | Why |
| --- | --- | --- | --- |
| 18 | Structured plan artifact (steps, status, replan) | A11 | Plan mode is prose only; execution cannot track progress per step |
| 19 | Dedicated format/lint/build/typecheck tools with structured results | B17 | Currently only generic allowlisted commands; agent cannot react to structured errors |
| 20 | Open-editors/selection tools for the agent | B15 | Selection context is only available through manual commands |
| 21 | Vision: vision-model setting, `images` payload, screenshot analysis, screenshot-to-code | H1–H6, L1–L4 | Depends on task 12; no vision model installed locally |
| 22 | Document processing: PDF/DOCX/XLSX/CSV/ZIP with bounds and safe extraction | I1–I7 | Depends on task 12; needs parser dependencies and zip-slip tests |
| 23 | Desktop runtime + authenticated IPC + mouse/keyboard/window/screenshot/OCR + emergency stop | K1–K11 | Largest remaining phase; Windows-first, separate Python runtime |
| 24 | Project/task memory and memory management UI | N5–N8 | Conversations and vectors exist; conventions/decisions/outcomes do not |
| 25 | MCP client, server config, discovery, invocation, trust | O1–O7 | Depends on the tool-registry seam (task 6) |
| 26 | UI decomposition and panels: attachments composer, diff panel, terminal panel, sidebar, settings, accessibility | Q8–Q15 | Current single-component view cannot host the new features |
| 27 | Git log and safe branch/checkout (read-only first) | E4, E5 | Commit/push stay excluded by policy |
| 28 | Encoding detection and chunked large-file reads | C6, C7 | 128 KiB rejection is safe but limiting |
| 29 | Tests for `delete_file`, `run_tests`, `search_symbols`, `get_workspace_info`, `inspect_dependencies` | B4, B9, B18, D6 | Implemented but unverified at the audit boundary |
| 30 | Terminal timeout/process-tree test | D5 | The 60s kill path has no coverage |
| 31 | Conversation delete test; CSP assertion | N3, P11 | Behavior exists, evidence does not |
| 32 | Webview interaction tests (streaming, mode switch, stop, conversation switch) | Q1–Q7, Q16 | UI is code-verified only |
| 33 | Security fixtures for archives/uploads (zip-slip, polyglot, giant files) | T13 | Required before attachments ship |
| 34 | Coverage reporting | T15 | No coverage provider configured |

## Low

| # | Task | IDs | Why |
| --- | --- | --- | --- |
| 35 | Multi-agent roles, routing, shared state, verifier | M1–M6 | Depends on engine seam, memory and provider routing |
| 36 | Cloud runtime: providers, credentials, routing, remote execution | S1–S6 | Local-first is the product stance; optional later |
| 37 | Model download/management and hardware diagnostics | R7, R8 | Deliberately out of scope today |
| 38 | Git commit/push/conflict resolution | E6–E8 | Intentionally excluded; would need a separate trust design |
| 39 | Remote CI run verification | T11 (blocked) | Local equivalent is green; needs repository credentials |
| 40 | Scoped permissions for browser/desktop/MCP | P16 | Only meaningful once those features exist |

## Blocked

| Item | Blocker | Unblock |
| --- | --- | --- |
| `npm run smoke:agent` | `qwen2.5-coder:3b` not installed (only 7b available) | Install the model or land task 15 (model override) |
| Live semantic search | No embedding model installed and `devpilot.embeddingModel` empty | `ollama pull` an embedding model and set the option |
| Vision verification | No vision model installed | `ollama pull` a vision model after task 21 |
| Latest CI run | No access to GitHub Actions history | Repository owner check, or run the workflow locally |

## Suggested execution order

```
Wave 1 (safety + engine):  2, 5, 6
Wave 2 (coding depth):     10, 11, 7, 8, 9, 19, 29, 30
Wave 3 (inputs):           12, 21, 22, 33
Wave 4 (execution + web):  13, 14, 16, 6 (provider), 17
Wave 5 (platform):         23, 24, 25, 26
Wave 6 (optional):         35, 36, 37, 38
```

Waves 1–2 deliver a genuinely stronger coding agent. Waves 3–4 are the prerequisites for the computer-use scope. Waves 5–6 depend on everything before them.

## Not a pending task

Fixing bugs from this audit is explicitly out of scope: the audit was read-only. The uncommitted 2026-11-13 timeout and no-tool-final fixes were already present and are included in the verified baseline.

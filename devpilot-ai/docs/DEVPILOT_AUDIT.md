# DevPilot AI — Codebase Audit (Phase A)

Initial audit date: 2026-11-13 · follow-up status: `IMPLEMENTATION_STATUS.md`
Audited version: 0.3.1 (`devpilot-ai/package.json`)
Scope: `devpilot-ai/` — `src`, `webview-ui/src`, `tests`, `scripts`, build/package config, existing documentation.
Method: every file below was read in full; claims in README/ARCHITECTURE were checked against code. Nothing in this document is inferred from documentation alone.

Baseline verified during this audit:

This is the historical Phase A audit snapshot. The later Wave 1 implementation and current requirement counts are recorded in `IMPLEMENTATION_STATUS.md`, `COMPLETION_REPORT.md` and `PROJECT_MEMORY.md`.

| Check | Command | Result |
| --- | --- | --- |
| Typecheck | `npm run typecheck` | pass (host, webview, host-test configs) |
| Unit tests | `npm test` | 9 files / 44 tests pass |
| Lint + production build | `npm run lint`, `npm run build` | not re-run in this audit (last recorded green in `VALIDATION.md`) |

Size: ~1,000 lines of extension TypeScript, ~64 lines webview TSX/CSS source, ~400 lines of tests. This is a compact preview, not a large codebase; every module can be extended in place.

---

## 1. Current architecture

Runtime path: VS Code extension host → `ChatViewProvider` (session state, modes, cancellation, approvals) → `AgentService` (decision loop) or `OllamaService.chat` (streaming) → tools via `ToolRegistry` → workspace/terminal/Git. The React webview is a single view that renders messages, selectors, timeline and approval cards; it talks to the host only through `postMessage` with the validated `ClientMessage` union in `src/types/index.ts`.

| Module | Lines | Responsibility | Notes |
| --- | --- | --- | --- |
| `src/extension.ts` | 24 | Activation, commands, webview registration | 9 commands, all delegating to one provider |
| `src/providers/ChatViewProvider.ts` | 228 | State machine: modes, streaming, approvals, conversations, timeouts, tool lifecycle | God-object; owns mode, persistence, tools, discovery |
| `src/services/AgentService.ts` | 63 | Bounded 8-step JSON decision loop | One inline prompt string; no planner/runner split |
| `src/services/OllamaService.ts` | 99 | Local-only HTTP: models, chat stream, embed, structured JSON | `localEndpoint` restricts to loopback; NDJSON parser |
| `src/services/WorkspaceService.ts` | 81 | Path resolution, ignore rules, read/list/search | Strong path hardening; in-process scanning |
| `src/services/PersistenceService.ts` | 171 | Atomic JSON store: conversations, vectors, undo | Single file, `version: 1`, 0o600 |
| `src/tools/ToolRegistry.ts` | 62 | Schema validation + dispatch for 16 tools | `switch` dispatch; plan-mode write block |
| `src/tools/ToolSchemas.ts` | 39 | Input schema, output schema, catalog, policy sets | Single source of truth for tool contracts |
| `src/tools/FileEditor.ts` | 88 | Diff preview, stale checks, apply, 20-record undo | Single-file only, no transaction |
| `src/tools/Terminal.ts` | 72 | Allowlisted commands, approval, 60s kill, Git filtering | No background processes |
| `src/security/ApprovalService.ts` | 19 | One pending approval, abortable | Host-side modal fallback exists |
| `src/security/Commands.ts` | 8 | Executable/arg allowlist | No shell metacharacters |
| `src/indexing/SemanticIndex.ts` | 32 | Bounded embeddings + cosine search | 48 files × 1,800 chars |
| `webview-ui/src/App.tsx` | 48 | Entire UI in one component | No attachment, diff, terminal or browser panels |

Design properties worth preserving: local-only inference boundary, explicit approval before every mutation/process, Zod-validated tool input **and** output, host-generated execution record that contradicts model prose, workspace trust gating, cancellation threaded through every tool, and honest documentation of limits.

### Current agent loop (as implemented)

```
generate() → AgentService.run()
  for iteration < 8:
    build single user message = guide + task + truncated recent tool events
    ollama.structured(..., format = JSON schema of decisionSchema)
    decision = decisionSchema.parse(result)      // invalid JSON throws out of the loop
    if final: return summary + execution record  // guarded: agent mode requires ≥1 tool call
    if repeated signature > 2: throw
    tool → ToolRegistry.execute → result appended to events (≤14,000 chars)
```

Two engine fixes landed immediately before this audit (both tested):

- `structured()` no longer imposes a 120s per-call cap; the caller's task signal (3 min chat / 10 min Plan+Agent) is the only deadline, so slow local models no longer fail with a raw transport timeout.
- Agent mode rejects a `final` decision taken before any tool ran: two nudges, then an explicit error instead of a false "Task completed".

---

## 2. Implemented features (verified in code)

| Feature | Status | Evidence |
| --- | --- | --- |
| Ollama model discovery | Implemented | `OllamaService.models` — 8s timeout, one retry, dedupe, loopback only |
| Streaming chat | Implemented | `OllamaService.chat` NDJSON reader (fragmented UTF-8, final frame without newline) |
| Chat / Plan / Agent modes | Implemented | `ChatViewProvider.mode`; `setMode`; plan blocks `writeTools` in `ToolRegistry` and in the catalog |
| Structured tool decisions | Implemented | `decisionSchema` (`tool` \| `final`), JSON-schema `format`, Zod parse |
| Multi-step loop | Implemented | 8 iterations, duplicate-signature stop at 3 |
| Tool result feedback | Implemented, bounded | Events concatenated newest-first within a character budget |
| File create/edit/patch/delete | Implemented | `FileEditor.change` / `patch`, SHA-256 preconditions |
| Per-file diff approval | Implemented | Virtual `devpilot-preview` diff + approval function, re-checks after approval |
| Command approval + allowlist | Implemented | `approvedTerminal`, `validateCommand`, npm script preview and manifest recheck |
| Terminal 60s limit, process-tree kill | Implemented (Windows + POSIX) | `runProcess` |
| Git status/diff | Implemented, read-only | `approvedTerminal` with `--no-pager`, external diff helpers disabled, path filtering |
| Workspace indexing | Implemented (inventory) | `indexWorkspace` lists allowed paths; no content index |
| Semantic retrieval | Implemented, optional | `SemanticIndex`, embedding model setting, stale-hash filtering |
| Conversation persistence | Implemented | 100 per workspace, 40 messages each, atomic writes |
| Undo / revert last change | Implemented | Last 20 records, persisted, no grouping |
| Stop / cancellation | Implemented | `AbortController` threaded into fetch, tools, approvals, processes |
| Task timeline | Implemented, in-memory | Last 60 entries, rendered in a `<details>` block |
| Editor context commands | Implemented | Explain / Fix / Generate tests use selection as untrusted prompt text |

Not present anywhere in the code (verified by search): browser automation, desktop automation, attachments/multimodal input, vision, PDF/DOCX/XLSX/ZIP parsing, MCP, multi-agent delegation, project/task memory, checkpoints, diagnostics, background processes, long-running servers, cloud execution.

---

## 3. Existing tools (16)

| Tool | Mode | Approval | Bound |
| --- | --- | --- | --- |
| `list_files` | Plan + Agent | none (trusted read) | 1,500 files, 10,000 entries, depth 20 |
| `read_file` | Plan + Agent | none | 128 KiB, UTF-8, binary rejected, 12,000 chars returned |
| `search_code` | Plan + Agent | none | 200 files scanned, 30 matches |
| `search_files` | Plan + Agent | none | 1,500 paths |
| `search_symbols` | Plan + Agent | none | VS Code language providers, 30 results |
| `search_semantic` | Plan + Agent | none | 5 results, needs embedding model |
| `inspect_dependencies` | Plan + Agent | none | 3 manifests, 6,000 chars each |
| `get_workspace_info` | Plan + Agent | none | — |
| `create_file` | Agent | per-file diff | 128 KiB |
| `edit_file` | Agent | per-file diff | 128 KiB, hash required |
| `apply_patch` | Agent | per-file diff | one file, exact, `fuzzFactor: 0` |
| `delete_file` | Agent | per-file diff | hash required |
| `run_terminal` | Agent | command | allowlist, 60s, 20,000 chars |
| `run_tests` | Agent | command | npm test or python -m pytest |
| `git_status` | Agent | command | filtered to workspace, secrets excluded |
| `git_diff` | Agent | command | filtered, `--no-ext-diff --no-textconv` |

---

## 4. Missing features vs the master prompt

Legend: **A** absent, **P** partial, **D** done.

| Master-prompt area | Status | Gap |
| --- | --- | --- |
| Phase 1 core engine | P | Loop works, but no provider abstraction, planner, task state, checkpoints, recovery, retry on malformed decision, usage accounting, or persisted history |
| Phase 2 coding agent | P | 16 tools, single-file edits. Missing diagnostics, open editors/selection tools, outline, references, rename, multi-file transaction, format/lint/build tools, debug session, Git write operations |
| Phase 3 attachments | A | No upload UI, no attachment service, no validators, CSP has no `img-src` |
| Phase 4 vision | A | No vision model setting; `ChatMessage` has no image field |
| Phase 5 documents | A | No PDF/DOCX/XLSX/CSV/ZIP readers |
| Phase 6 browser | A | Playwright not a dependency |
| Phase 7 desktop | A | No Python runtime, no IPC bridge |
| Phase 8 execution engine | P | Foreground only, hard 60s kill, no ports/health/log streaming/audit log |
| Phase 9 multi-agent | A | Single `AgentService` |
| Phase 10 memory | P | Conversation + bounded vectors only; no project/task memory, no resumable tasks |
| Phase 11 MCP | A | No SDK, no trust model |
| Phase 12 UI | P | Messages, modes, timeline, approvals, selectors. Missing sidebar, attachment composer, diff/terminal/browser panels |
| Phase 13 local + cloud | A | Local only (correct for the current milestone) |
| Phase 14 security | P | Strong path/command/approval controls; missing secret redaction, audit log, permission tiers, domain policy, archive protection |
| Phase 15 testing | P | 44 unit tests, one loopback HTTP test, one read-only model smoke; no attachment/browser/desktop/security-fixture suites |

---

## 5. Architectural weaknesses

Ordered by how much they block the master-prompt phases.

- **W1 — No model-provider abstraction.** `AgentService` takes a concrete `OllamaService`. Cloud providers, vision models and per-agent model selection all require this seam first.
- **W2 — Monolithic decision loop.** One 63-line method holds prompt construction, budgeting, policy, tool dispatch, repetition detection and reporting; the guide string alone is ~900 characters. Adding planner/verifier/checkpoint stages inside it will produce an untestable method.
- **W3 — No recovery.** A malformed or truncated JSON decision throws out of `run()`, ending the task with a parse error. No retry, no repair prompt, no repair of truncated `final.summary`.
- **W4 — Character-based context accounting.** `contextLimit` is treated as a character budget and `num_predict = min(4096, contextLimit/2)`. At the default 4096 this is ~2,048 output tokens; a large HTML/CSS file written in one tool call can be truncated mid-JSON, which then surfaces as a parse error.
- **W5 — Raw tool results in the prompt.** Up to 14,000 characters of JSON per step compete with the task; no summarization, no diff compression, no dedupe.
- **W6 — No language-server feedback.** The agent cannot see diagnostics, so "fix the bug" tasks are blind; `run_tests` is the only signal and it must be approved every time.
- **W7 — Single-component webview.** `App.tsx` is 48 dense lines with no component boundaries; panels, attachments and viewer tabs need a decomposition first.
- **W8 — JSON store limitations.** Whole-file rewrite per update, no migration path beyond rejecting `version !== 1`, no encryption, no audit records.
- **W9 — No process manager.** `runProcess` kills at 60s, so dev servers, watchers and previews are impossible; browser/vision verification needs a live server.
- **W10 — In-memory timeline.** Execution history (the "never claim success" evidence) is lost on reload and cannot be audited.

---

## 6. Security findings

| ID | Severity | Finding | Evidence | Recommendation |
| --- | --- | --- | --- | --- |
| S1 | Medium | No secret redaction in prompts. Filename rules catch `.env`, keys, credentials, but a `config.ts` with a hardcoded token is read and sent to the model | `WorkspaceService.forbidden`, `read_file` | Add content heuristics + user-visible redaction before prompt assembly |
| S2 | Medium | Stored data unencrypted, including file snippets in undo records | `PersistenceService` `mode: 0o600` | Document explicitly (done in SECURITY.md); consider VS Code `SecretStorage` for any future credentials |
| S3 | Medium | Supply-chain path: agent can propose editing `package.json` scripts, then `run_tests`/`npm run build` executes project code. Two approvals, no elevated warning | `FileEditor` + `approvedTerminal` | Give manifest/`.vscode`/CI files a SENSITIVE tier with a distinct warning and no chained auto-approval |
| S4 | Low | npm spawned through `cmd.exe /c npm <joined args>` string | `Terminal.runProcess` | Keep allowlist, but pass argv with `shell: false` where possible |
| S5 | Low | No audit log of tool executions or commands | timeline is memory-only | Persist a bounded execution log |
| S6 | Low | Webview CSP lacks `img-src`; attachments phase must extend CSP deliberately | `ChatViewProvider.resolveWebviewView` | Allow only `blob:`/`data:` for local previews, never remote |
| S7 | Low | Prompt injection from file contents is mitigated by instruction only | `AgentService` guide | Wrap tool results in explicit untrusted delimiters; never let file text trigger tool choice without a model decision |
| S8 | Info | `.vscodeignore` packaging and inventory checks are in place; VSIX verified | `scripts/package.mjs`, `VALIDATION.md` | Re-verify after every phase |

Positive controls already present: loopback-only endpoint, redirects blocked, symlink/hardlink rejection, device-name and traversal checks, nested `.gitignore` handling, binary/size limits, command allowlist with metacharacter rejection, npm script preview + manifest recheck, trust gating in registry/editor/terminal, one pending approval at a time, Zod validation of both directions.

---

## 7. Dependency compatibility

Current: Node `>=22`, VS Code `^1.95`, TypeScript 5.7, React 19, zod 4.6, Tailwind 4, esbuild 0.28, vitest 5, ESLint 10, `diff` 9, `ignore` 7, `react-markdown` 10, `lucide-react`.

| Phase need | Candidate | Fit / risk |
| --- | --- | --- |
| Provider abstraction | in-repo interface | No dependency |
| Diagnostics / symbols / rename | VS Code API (`languages.getDiagnostics`, `executeDocumentSymbolProvider`, `executeReferenceProvider`, `executeRename`) | Zero install, works with installed language servers |
| Attachments: PDF | `pdfjs-dist` (text) | Pure JS, but large; lazy-load in host |
| DOCX | `mammoth` | Small, text extraction only |
| XLSX | `exceljs` | Maintained; avoid `xlsx` (stale npm build) |
| ZIP | `yauzl` | Streaming, enables zip-slip-safe extraction |
| Images | Ollama native `images` field (base64) + `image-size` | No native binaries; avoid `sharp` in a bundled extension |
| Browser | `playwright-core` + user Chrome | Do **not** bundle browsers in the VSIX; lazy import, externalize in esbuild |
| MCP | `@modelcontextprotocol/sdk` | Node-native, fits host process |
| Desktop | Python 3.11 + `pyautogui`, `pywinauto`, `pillow` | Separate runtime; needs authenticated local IPC and Windows-only gating |

Bundling constraints: `esbuild` bundles the extension into one CJS file; Playwright and any native module must be `external` and resolved at runtime with a clear "not installed" error. VSIX size and activation time must stay bounded — install heavy features lazily behind commands/settings.

---

## 8. Files that need modification

| File | Why |
| --- | --- |
| `src/services/AgentService.ts` | Split into orchestrator/planner/decision parser; retries; checkpoints; provider seam |
| `src/services/OllamaService.ts` | Provider interface implementation; vision message support; usage reporting |
| `src/tools/ToolRegistry.ts` | Dispatch table, permission tiers, new tool families, MCP bridge |
| `src/tools/ToolSchemas.ts` | New tool contracts (IDE, attachments, browser, desktop, MCP) |
| `src/tools/Terminal.ts` | Process manager: background jobs, ports, logs, stop |
| `src/tools/FileEditor.ts` | Multi-file transaction, named checkpoints, grouped revert |
| `src/providers/ChatViewProvider.ts` | New modes, attachment pipeline, panels, CSP, approval tiers, persisted history |
| `src/types/index.ts` | Attachments, new client messages, modes, panel state |
| `src/services/PersistenceService.ts` | Versioned migration, execution log, task memory |
| `webview-ui/src/App.tsx` | Component decomposition, sidebar, attachment composer, panels |
| `webview-ui/src/styles.css` | Layout for sidebar/panels, attachment previews |
| `package.json` (extension) | Settings: vision model, browser/desktop toggles, permission tiers, MCP servers |
| `build.mjs` | Externals for Playwright/native modules; lazy chunks |
| `README.md`, `ARCHITECTURE.md`, `ROADMAP.md`, `VALIDATION.md`, `SECURITY.md` | Keep claims equal to code |

## 9. New files to create

- Engine: `src/agent/AgentOrchestrator.ts`, `AgentRouter.ts`, `TaskPlanner.ts`, `TaskRunner.ts`, `AgentState.ts`, `TaskRecovery.ts`, `src/providers/ModelProvider.ts`, `OllamaProvider.ts`, `CloudProvider.ts` (later).
- IDE tools: `src/tools/Diagnostics.ts`, `EditorState.ts`, `Outline.ts`, `References.ts`, `MultiFilePatch.ts`.
- Execution: `src/execution/ProcessManager.ts`, `AuditLog.ts`.
- Attachments: `src/attachments/AttachmentService.ts`, `AttachmentValidator.ts`, `ImageProcessor.ts`, `DocumentProcessor.ts`, `ArchiveProcessor.ts`.
- Vision: `src/vision/VisionService.ts`, `ScreenshotToCode.ts`.
- Browser: `src/browser/BrowserEngine.ts`, `BrowserSessionManager.ts`, `BrowserNavigation.ts`, `BrowserInteraction.ts`, `BrowserExtraction.ts`, `BrowserScreenshot.ts`.
- Desktop: `desktop-runtime/` (`main.py`, `controller.py`, `screenshot.py`, `mouse.py`, `keyboard.py`, `windows.py`, `application_manager.py`, `vision.py`, `security.py`) + `src/desktop/DesktopBridge.ts`.
- Memory/MCP: `src/memory/ProjectMemory.ts`, `TaskMemory.ts`, `src/mcp/McpClient.ts`, `McpTrust.ts`.
- Docs: `docs/AGENT_ENGINE.md`, `CODING_AGENT.md`, `ATTACHMENTS.md`, `VISION_ENGINE.md`, `BROWSER_AGENT.md`, `DESKTOP_AGENT.md`, `MCP_INTEGRATION.md`, `DEPLOYMENT.md`, `IMPLEMENTATION_STATUS.md`.

---

## 10. Recommended implementation order (dependency map)

```
B1 provider seam + engine hardening ──┬──► B2 IDE tools ──► B3 multi-file transaction
                                      ├──► B4 process manager ──► B7 browser ──► B6 vision verification
                                      ├──► B9 memory + multi-agent
                                      └──► B10 MCP
B5 attachments + documents ──► B6 vision (needs image payload)
B5 + B7 + B4 ──► B11 UI panels ──► B12 cloud (optional, deferred)
```

| Batch | Content | Depends on | Acceptance |
| --- | --- | --- | --- |
| **B1** | Provider interface, orchestrator/planner split, decision retry, per-step deadline from remaining budget, usage accounting, persisted execution log | — | All current tests pass; new tests for parse-retry, budget derivation, provider swap |
| B2 | Diagnostics, open editors, selection, outline, references, rename, format, lint, build tools | B1 | Typecheck + tests; tools appear in catalog with correct permission tier |
| B3 | Multi-file patch, named checkpoint, grouped rollback | B1, B2 | Two-file feature edit + full revert in unit tests |
| B4 | Background process manager: start/stop/status, ports, bounded logs | B1 | Dev-server fixture starts, reports port, stops cleanly |
| B5 | Attachments: validation, image, PDF/DOCX/XLSX/CSV, ZIP inspection, CSP update, composer UI | B1 | Upload fixtures parsed; oversized/malicious inputs rejected |
| B6 | Vision: configurable vision model, image messages, screenshot → plan → code | B5, B7 | One screenshot → HTML/CSS flow, verified manually |
| B7 | Browser: Playwright session, navigation, interaction, extraction, screenshots, approvals, domain policy | B4 | Local fixture page: navigate, fill, click, extract, screenshot |
| B8 | Desktop runtime (Windows) + authenticated IPC + emergency stop | B1 | Notepad/folder task with screenshot verification; stop honoured |
| B9 | Project/task memory, resumable tasks, multi-agent routing | B1 | Task resumes after reload; router picks correct specialist |
| B10 | MCP client, trust prompts, tool bridging | B1 | One approved server: discover, call, deny-unauthorized |
| B11 | UI: sidebar, panels, attachment composer, browser view | B5, B7 | No regression; all states accessible |
| B12 | Optional cloud control plane | B1, B9 | Deferred; local-first remains default |

---

## Task intake — master prompt → this repository

The pasted master development prompt is registered as a program of work with the batches above, not as a single change. Mapping:

| Master prompt phase | Batch |
| --- | --- |
| Phase 0 / Phase A (audit) | **This document** |
| Phase 1 (core engine) | B1 |
| Phase 2 (coding agent) | B2, B3 |
| Phase 3 (attachments) | B5 |
| Phase 4 (vision) | B6 |
| Phase 5 (documents) | B5 |
| Phase 6 (browser) | B7 |
| Phase 7 (desktop) | B8 |
| Phase 8 (terminal engine) | B4 |
| Phase 9 (multi-agent) | B9 |
| Phase 10 (memory) | B9 |
| Phase 11 (MCP) | B10 |
| Phase 12 (UI) | B11 |
| Phase 13 (local + cloud) | B12 (optional, deferred) |
| Phase 14 (security) | Continuous; S3/S1/S5 in B1/B2, archive + domain policy in B5/B7 |
| Phase 15 (testing) | Per batch; fixtures added with each feature |

## Proposed first safe batch (B1)

Goal: make the engine extensible and self-recovering **without changing user-visible behaviour or any tool contract**.

1. `src/providers/ModelProvider.ts` — interface `{ chat, structured, models, embed? }`; `OllamaProvider` wraps `OllamaService`; `AgentService` depends on the interface. No behaviour change.
2. `src/agent/` — move prompt construction (`TaskPlanner`), decision parsing/retry (`TaskRunner`), state (`AgentState`) and final reporting out of the single `run()` method. Preserve: 8 steps, duplicate detection, no-tool-final guard, execution record format.
3. Decision retry: on invalid/truncated JSON, feed the parse error back once per step with `temperature: 0` and `num_predict` raised, instead of throwing.
4. Per-step deadline derived from the remaining task budget so one slow call cannot consume the whole run silently; still no per-call cap below the task deadline.
5. Usage accounting (`prompt_eval_count`/`eval_count`) recorded per step and shown in the existing usage line.
6. Persist the last N execution-log entries in the existing JSON store (`version: 2` with backward-compatible migration from `version: 1`).

Out of scope for B1: new tools, UI redesign, any new dependency, any change to approval or security policy.

Risks: prompt/behaviour drift for small models (mitigated by keeping the same guide text and snapshot tests for prompt assembly); store migration (mitigated by migration test + retaining `version: 1` read path).

Estimated diff: ~400–500 added lines across 6 files, plus ~8 tests. No destructive change, no new dependency, no packaging change.

## Audit conclusions

- The foundation is sound and unusually careful about approvals, path safety and honest reporting; it is worth extending rather than rewriting.
- The five real blockers to the master-prompt scope are: no provider seam, no recovery, no diagnostics, no attachment/multimodal pipeline, no process manager. Everything else (browser, desktop, MCP, multi-agent) composes on top of those.
- Documentation currently matches the code, including explicit non-claims. That property must be preserved: every batch ships with updated `ROADMAP.md`, `VALIDATION.md` and `CHANGELOG.md`, and no batch is marked complete without its tests actually run.

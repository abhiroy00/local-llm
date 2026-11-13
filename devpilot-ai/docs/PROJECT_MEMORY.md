# DevPilot AI — Project Memory

Durable record of **what changed, why, and how it was verified**. Written 2026-11-13 so that any agent can reconstruct the current state without re-reading the whole history. This file records facts and decisions; it is not a roadmap (see `PENDING_TASKS.md`) and not a checklist (see `IMPLEMENTATION_STATUS.md`).

---

## 2026-11-12 — baseline: 0.3.1 agent preview

State inherited by this work:

- Local Ollama chat with streaming, plus Plan and Agent modes.
- 16 tools, per-change diff approval, allowlisted terminal commands, read-only Git, bounded semantic retrieval.
- Single JSON persistence store (`devpilot-state.json`, `version: 1`, 0600) for conversations, vectors and 20 undo records.
- 9 commands, single webview view, CSP with nonce, no telemetry.
- CI workflow (`.github/workflows/ci.yml`): Windows + Ubuntu, `npm ci`, `npm run check`, `npm audit --omit=dev`, `npm run package`, artifact upload.
- 42 tests at that point; VSIX `devpilot-ai-0.3.1.vsix`.

Relevant constraint from that release: `VALIDATION.md` explicitly stated that native Extension Host execution had been blocked by a VS Code updater lock and that interactive approval-card validation was pending. That honesty is part of the project's standard.

---

## 2026-11-13 — fix 1: task timeout (raw abort message)

### Symptom

Plan/Agent runs on slow local models failed with the raw transport error:

```
The operation was aborted due to timeout
```

instead of a useful task-level message, and sometimes before the documented 10-minute Agent deadline.

### Root cause

`OllamaService.structured()` wrapped each model call in its own fixed `AbortSignal.timeout(120000)`. The ChatViewProvider's task controller (180s chat, 600s Plan/Agent) never aborted in those cases, so the inner abort surfaced as an undici timeout string rather than the mapped "Task timed out" message. A single slow structured call could also kill an otherwise healthy task at 2 minutes.

### Change

- Removed the fixed 120s cap from the structured call. The caller's task signal is now the only deadline.
- Kept the 8s cap on model discovery (`/api/tags`) because it is idempotent and retried once.
- Updated `README.md` limits line to "3-minute Chat and 10-minute Plan/Agent task deadlines".
- Added a `CHANGELOG.md` `## Unreleased` entry.

### Why this shape

The provider should not own product deadlines. One timer at the task boundary gives one error mapping and one place to tune limits. Raising the inner cap instead would have preserved two competing deadlines.

### Verification

`npm run typecheck` pass; full suite pass. No live slow-model reproduction was recorded, so the fix is reasoned from the signal graph rather than timed against a deliberately slow model.

Files: `src/services/OllamaService.ts`, `README.md`, `CHANGELOG.md`.

---

## 2026-11-13 — fix 2: false "Task completed" in Agent mode

### Symptom

Agent mode returned:

```
Task completed.
No recent tool results provided.
Execution record: No file changes applied. Tests: No passing test command recorded.
```

without reading or changing anything.

### Root cause

The model emitted `{"action":"final"}` at iteration 0, before any tool call. The loop accepted it because the only guard was `events.length`, and nudge messages were also pushed into `events`, so an event-based check could be satisfied by conversation bookkeeping rather than real tool execution.

### Change (`AgentService.ts`)

- Separate `toolCalls` counter, incremented only before `this.tools.execute(...)`.
- Agent mode rejects a no-tool `final`: sends up to two explicit nudges, then throws `Stopped: the model claimed completion without using a tool.`
- Prompt guidance and an empty-history line: `(none yet: run a tool before answering)`.
- Two tests in `tests/agent.test.ts`: (a) nudge leads to a tool call and a valid final; (b) persistent refusal produces the explicit error.

### Why this shape

Auto-running a tool on the model's behalf would fabricate evidence. Nudging keeps the decision with the model and fails loudly if it will not act. A dedicated counter is required because the event log is shared with nudges.

### Verification

`npm run typecheck` pass; `npm test` **44/44 across 9 files** (agent file now has 7 tests). Not verified against a live model in Agent mode without tools; the guard is unit-tested with mocked decisions.

Files: `src/services/AgentService.ts`, `tests/agent.test.ts`, `CHANGELOG.md`, `README.md`.

---

## 2026-11-13 — audit layer (Phase A of the master prompt)

The master development prompt was treated as a batched program, not a single change. Phase A was a read-only, code-verified audit; no feature was implemented.

### Produced

| File | Content |
| --- | --- |
| `docs/DEVPILOT_AUDIT.md` | Architecture map, implemented features with evidence, 16-tool table, master-prompt gap matrix, weaknesses, security findings, dependency compatibility, files to modify/create, dependency map, batches B1–B12 |
| `docs/IMPLEMENTATION_STATUS.md` | 194 requirements across A–T, each COMPLETED / PARTIAL / NOT IMPLEMENTED / FAILED / BLOCKED, with evidence and a verified flag |
| `docs/COMPLETION_REPORT.md` | Feature-wise A–T report, executed checks, percentages, verdict |
| `docs/PENDING_TASKS.md` | 40 prioritized tasks (Critical/High/Medium/Low), blocked items, 6 execution waves |
| `docs/FAILED_TESTS.md` | Every executed command and exit code, blocked smoke root cause, unexecutable checks, test gaps |

Also updated: `ROADMAP.md` (program registered: Phase A complete, B1 proposed, B2–B12 not started) and `README.md` (docs link).

### Key findings

- **73/194 completed (37.6%); 58/194 verified (29.9%); 0 failed; 2 blocked.**
- Zero implementation for browser, desktop, screenshot analysis, vision, image/file upload, PDF/DOCX/XLSX/ZIP, MCP, multi-agent, cloud.
- Five critical gaps: decision parse retry, sensitive-file tier (`package.json` → `npm test` supply-chain path), content-level secret redaction, persisted audit log, per-step deadline.
- Architecture blockers: no model-provider seam, monolithic 8-step loop, character-based context accounting, no diagnostics integration, no process manager.

### Audit method notes (important for trust)

- Every source, test, config and doc file was read; documentation claims were checked against code.
- Real-model probe used the installed `qwen2.5-coder:7b` via a **temporary copy** of `scripts/agent-smoke.ts` (model name changed, esbuild-bundled into a temp dir). Project source was not edited. Result: `read_file` executed and the answer matched `export const hello = 42`.
- `npm run smoke:agent` itself exits 1 because it hardcodes `qwen2.5-coder:3b`, which is not installed. It is recorded as **BLOCKED**, not FAILED.
- **No source file was modified by the audit.** Running `npm run build` and `npm run package` regenerated `dist/` and `artifacts/`; the VSIX SHA-256 changed from `44e375b8…3799f6f` to `aae3350c…4d0937`. The regenerated package also ships `docs/` (Markdown is not in `.vscodeignore`).
- The webview was not driven by automation, so UI behavior is code-verified only.

---

## 2026-11-13 — documentation set completed

Added this memory file and root `AGENTS.md` so the next agent can start without re-deriving context. `AGENTS.md` holds the working rules, architecture map, invariants, gotchas and current uncommitted state; this file holds the chronological why.

---

## Current state (as of 2026-11-13, end of session)

### Uncommitted working tree

Modified: `src/services/OllamaService.ts`, `src/services/AgentService.ts`, `tests/agent.test.ts`, `README.md`, `CHANGELOG.md`, `ROADMAP.md`, `artifacts/devpilot-ai-0.3.1.vsix.sha256`, `artifacts/package-report.json`.

Untracked: `docs/` (six Markdown files), `AGENTS.md`.

No commit was created. Nothing was pushed, tagged or published. The pre-existing code fixes and the audit docs are all still local.

### Verified baseline

`npm run typecheck` pass · `npm run lint` pass · `npm test` 44/44 · `npm run build` pass · `npm run test:host` pass · `npm run package` pass (18 files, 337.26 KB) · `npm audit --omit=dev` 0 vulnerabilities · agent probe with 7b pass.

### Environment facts

Windows (win32), Node v24.20.0, npm 11.19.0, VS Code 1.146.0, Ollama at `127.0.0.1:11434` with only `qwen2.5-coder:7b`. No embedding model, no vision model, no Playwright browsers.

### Open decisions / next move

- B1 (provider seam + loop split + decision retry + per-step budget + usage + persisted history) was proposed and **not started**. It needs the user's go-ahead.
- Do not start browser/desktop/MCP work before the engine seams exist; the dependency map in `DEVPILOT_AUDIT.md` explains why.
- The smoke script should gain a model override (`DEVPILOT_SMOKE_MODEL`) before it is used as a release gate.

### Decisions that should not be silently reversed

1. No inner per-call timeout below the task deadline (fix 1).
2. No-tool `final` is an error in Agent mode, not a success (fix 2).
3. Approvals stay mandatory for every mutation and command, even if a future UI adds "approve all" convenience.
4. Local-only inference stays the default; cloud is a separate, explicitly approved track.
5. Reports distinguish COMPLETED from verified, and partials never count as completed.
6. Documentation must state what was not tested. "Not verified" is an acceptable sentence; an unearned "works" is not.

---

## Wave 1 follow-up — decision recovery, secret handling, audit history

Implemented against the master-prompt backlog while retaining the existing local Ollama, trusted-workspace and per-action approval architecture:

- `AgentService` retries malformed or schema-invalid decisions once with corrective feedback; tests verify an invalid decision never executes a tool and a second failure stops.
- Ollama model discovery now waits up to 30 seconds and maps its internal timeout to a clear local-server message instead of exposing the raw abort exception.
- `SecretRedactor` heuristically redacts detected credentials in model context, tool results, semantic indexing and persistence. Detected secret-bearing files cannot be edited by Agent tools, and unsafe undo records are not persisted. Detection is heuristic and not exhaustive.
- Executable configuration files receive a distinct elevated warning/action. A chain-aware extra approval after editing such a file remains open work.
- Persistence schema v2 migrates v1 state and stores at most 1000 redacted tool/approval audit events. Show and confirmation-gated Clear commands are exposed in the Command Palette; revert activity uses the same audit path.
- Tests cover recovery, secret redaction, audit persistence/redaction/retention/clear, approved/rejected decisions, sensitive-file approval and discovery timeout mapping. `npm run check` passed: typecheck, lint, 10 test files / 63 tests, build. The focused tool/persistence suites also passed (26 tests); the focused Ollama suites passed 8 tests.
- The Extension Host, package generation, dependency audit and model smoke were not rerun during this follow-up. Previous host/package/smoke results remain historical; the default smoke still requires the unavailable `qwen2.5-coder:3b`.

No commit was created. Pre-existing user changes and dirty artifacts were preserved.

# AGENTS.md — working memory for DevPilot AI

This file is the entry point for any agent (or human) picking up this repository. Read it before touching code, then follow the links at the bottom.

## What this repository is

**local-llm** is the monorepo home of **DevPilot AI**, a local-first AI coding assistant for VS Code. The product lives in `devpilot-ai/`; the repository root is only a wrapper with delegating scripts. There is no build step at the root.

- Extension version: **0.3.1** (unreleased fixes staged in `CHANGELOG.md` under `## Unreleased`).
- Runtime target: VS Code `^1.95.0`, Node `>=22` (local machine used Node 24).
- Inference: **Ollama only**, loopback only (`localhost`, `127.0.0.1`, `[::1]`); redirects blocked; no telemetry; no cloud calls.
- What it is today: a working local chat + guarded coding-agent preview (16 tools, approvals, persistence and audit history).
- What it is **not**: an autonomous computer-use platform. Browser, desktop, attachments, vision, PDF/DOCX/XLSX, MCP, multi-agent, cloud and memory systems have **no implementation**. Do not describe them as existing.

## Commands (run from repository root)

```sh
npm ci            # installs devpilot-ai dependencies via postinstall shim
npm run check     # typecheck + lint + tests + build (the gate)
npm test          # vitest: 10 files / 63 tests
npm run typecheck # host + webview + host-test projects
npm run lint      # eslint src webview-ui/src tests
npm run build     # esbuild extension + webview, tailwind css → dist/
npm run package   # build + VSIX, inventory + SHA-256 → devpilot-ai/artifacts/
npm run test:host # real VS Code Extension Host integration (needs VS Code installed)
npm run smoke:agent # real model smoke; currently hardcodes qwen2.5-coder:3b
```

Inside `devpilot-ai/` the same scripts exist without the prefix. F5 uses `.vscode/launch.json` with a `build` pre-launch task, so a manual build is not needed before debugging.

## Architecture map (`devpilot-ai/src`, ~1,000 lines)

| Module | Role |
| --- | --- |
| `extension.ts` | Activation, 11 commands, webview registration |
| `providers/ChatViewProvider.ts` | Session state machine: modes, streaming, approvals, conversation persistence, deadlines, tool lifecycle, CSP |
| `services/AgentService.ts` | 8-step JSON decision loop, duplicate detection, no-tool-final guard, execution record |
| `services/OllamaService.ts` | Local-only HTTP: `/api/tags`, `/api/chat` (NDJSON stream), `/api/embed`, structured JSON |
| `services/WorkspaceService.ts` | Path resolution, ignore rules, bounded list/read/search |
| `services/PersistenceService.ts` | Versioned JSON store: conversations, semantic vectors, undo records, bounded audit history |
| `tools/ToolRegistry.ts` | Zod-validated dispatch, plan-mode write block, approval plumbing |
| `tools/ToolSchemas.ts` | Tool input/output schemas, catalog, `writeTools` policy set |
| `tools/FileEditor.ts` | Diff preview, stale/hash checks, apply, 20-record undo |
| `tools/Terminal.ts` | Allowlisted commands, approval, npm manifest recheck, 60s kill, Git output filtering |
| `security/ApprovalService.ts` | Exactly one pending approval, abortable, id-scoped |
| `security/Commands.ts` | Executable/argument allowlist, metacharacter rejection |
| `security/SecretRedactor.ts` | Heuristic credential detection and redaction (not exhaustive) |
| `indexing/SemanticIndex.ts` | 48-file / 1,800-char embedding index with cosine search and persisted vectors |
| `webview-ui/src/App.tsx` | Entire UI in one component (48 dense lines) |

Data flow: webview `postMessage` → `parseClientMessage` (Zod-style manual validation) → provider → agent or chat → tool registry → workspace/terminal. All tool calls re-validate workspace trust and paths inside the tool, not only in the UI.

## The 16 tools (do not add duplicates)

Read-only, allowed in Plan and Agent: `list_files`, `read_file`, `search_code`, `search_files`, `search_symbols`, `search_semantic`, `get_workspace_info`, `inspect_dependencies`.

Write/execute, Agent only, each approved: `create_file`, `edit_file`, `apply_patch`, `delete_file`, `run_terminal`, `run_tests`, `git_status`, `git_diff`.

`writeTools` in `ToolSchemas.ts` is the single policy source; plan mode is blocked in both the catalog and the registry.

## Hard-won invariants (do not regress)

1. **No completion claim without evidence.** Agent mode rejects a `final` decision taken before any tool ran. Two nudges, then an explicit error. The execution record ("No file changes applied", "No passing test command recorded") is host-generated prose, not model prose.
2. **Local-only inference.** `localEndpoint()` rejects remote hosts, credentials, paths, query strings, hashes and non-HTTP schemes. Never add a cloud endpoint without an explicit product decision.
3. **Approval before every mutation or process.** One approval at a time; ids are checked; mutation is re-validated after approval (disk state may have changed).
4. **Plan mode never writes.** Enforced at registry level, independent of the prompt.
5. **Path safety is layered.** Traversal, symlinks, junctions, hardlinks, device names, secret filenames, nested `.gitignore`, VS Code excludes, 128 KiB cap, NUL-based binary rejection.
6. **Character-based context accounting.** `contextLimit` is characters, output budget is `min(4096, limit/2)`. Large single-file writes can truncate JSON — that is the main cause of agent parse failures.
7. **Deadlines:** chat 180s, Plan/Agent 600s, terminal command 60s, model discovery 30s. Do not reintroduce a per-call cap below the task deadline.
8. **Tests must be executed, never inferred.** Docs in this repo are allowed to say "not verified"; they are not allowed to claim passing behavior that was not run.

## Current work state (Wave 1 follow-up, uncommitted)

Pre-existing user changes and audit docs were preserved. Current implementation adds:

| File | Change |
| --- | --- |
| `src/services/AgentService.ts` | One bounded repair for malformed/schema-invalid decisions; existing no-tool-final guard retained |
| `src/security/SecretRedactor.ts` and related model/tool/index/persistence paths | Heuristic redaction; detected-secret edits and unsafe undo persistence blocked |
| `src/tools/FileEditor.ts` | Distinct warning/action for executable configuration files |
| `src/services/PersistenceService.ts`, `src/tools/ToolRegistry.ts`, `src/extension.ts` | Version-2 storage, bounded redacted audit events, Show/Clear commands; revert is audited |
| Tests and docs | Recovery, redaction, audit persistence/retention/clear and sensitive-file approval coverage; status docs updated |

`npm run check` passed on the follow-up: typecheck, lint, 10 files / 63 tests, build. Host integration, packaging and dependency audit were not rerun. Default `npm run smoke:agent` is blocked because `qwen2.5-coder:3b` is not installed; an earlier temporary 7b probe passed.

No commit has been created. Do not commit, push, tag or publish unless the user explicitly asks.

## Audit snapshot (evidence-based)

The initial audit counted **194 requirements**. After the follow-up: 75 completed (38.7%), 10 partial (5.2%), 107 not implemented (55.2%), 0 failed, 2 blocked; 60 completed requirements are verified.

Zero-code areas: browser (12), desktop (11), screenshot analysis (4), vision (6), image upload (5), file upload (6), documents (7), MCP (7), multi-agent (6), cloud (6).

Remaining critical work: chain-aware approval after sensitive configuration edits and per-step deadlines. Secret matching is heuristic; full task history/resume is still absent.

## Gotchas an agent will hit

- **Windows/CRLF:** edits and reverts operate on saved bytes; hashes are SHA-256 of the on-disk content. Never hash the in-memory string with `\n` assumptions.
- **Extension Host tests:** require VS Code installed; can be blocked by a pending VS Code updater lock. The host suite uses an approval **callback**, not the webview card, and reports `approvalDriver: "test callback (not UI)"`.
- **Smoke model:** hardcoded `qwen2.5-coder:3b`. To probe locally, copy the script to a temp dir, change the model name, bundle with esbuild; do not edit the source just to make a check pass.
- **Persisted store:** whole-file atomic rewrite, mode 0600; version 1 migrates to version 2. Schema changes need an explicit migration, never a silent reset.
- **Secret detection:** content-level matching is heuristic and not exhaustive; do not promise secrets are always found or send credentials intentionally.
- **CSP:** `default-src 'none'`, nonce scripts, no `img-src`. Adding attachments requires a deliberate CSP change (`blob:`/`data:` only).
- **Packaging:** `.vscodeignore` excludes `src`, `tests`, `scripts`, maps and node_modules, but ships Markdown docs. `scripts/package.mjs` fails on unexpected content — keep it strict.
- **No embedding or vision model** is installed locally, so semantic search and any vision flow can only be mock-tested right now.
- **No UI automation.** Anything in `App.tsx` is code-verified only.

## Ground rules for changes

- Extend the existing architecture; do not rewrite working modules or create a second tool registry.
- No new dependency without approval; if adding one, check bundling impact (`esbuild` single-file host bundle) and VSIX size.
- TypeScript is strict; keep schemas as the contract and validate both input and output.
- Every behavior change ships with tests **actually run**, plus `README.md`/`VALIDATION.md`/`CHANGELOG.md` kept truthful.
- Preserve approvals, local-only inference and honest reporting even when it makes the demo shorter.

## Document index

- `devpilot-ai/docs/PROJECT_MEMORY.md` — dated change history with root causes and verification.
- `devpilot-ai/docs/DEVPILOT_AUDIT.md` — architecture audit, dependency map, batch plan B1–B12.
- `devpilot-ai/docs/IMPLEMENTATION_STATUS.md` — 194-row requirement checklist.
- `devpilot-ai/docs/COMPLETION_REPORT.md` — feature-wise A–T report and percentages.
- `devpilot-ai/docs/PENDING_TASKS.md` — prioritized backlog and waves.
- `devpilot-ai/docs/FAILED_TESTS.md` — executed checks, blocked tests, test gaps.
- `devpilot-ai/ROADMAP.md`, `VALIDATION.md`, `ARCHITECTURE.md`, `SECURITY.md` — product scope and verified limits.

# DevPilot AI

**Your Code. Your Machine. Your AI.**

DevPilot AI 0.6.2 is a local coding agent for VS Code with Ollama, approved edits and commands, and a compact chat sidebar. It appears in the **right-hand Secondary Side Bar**, alongside views such as Chat and Codex. Requires VS Code 1.106+.

## DeepSeek and Windows

Use **DevPilot AI: Set Up DeepSeek Models** (or the model-chip button in the sidebar) to download/select free local DeepSeek weights. For a 16 GB MacBook Air, start with Coder 1.3B and low-memory mode. The larger Coder 6.7B/R1 8B profiles require explicit Balanced mode and are not performance-validated on this Mac. Model cards link to official Hugging Face checkpoints; downloads are their Ollama quantizations, not a free hosted API. The same VSIX/setup flow supports Windows.

See [MODELS.md](MODELS.md) for hardware/model details and [WINDOWS.md](WINDOWS.md) for Windows installation, commands and verification limits.

## Start locally

Install Node 22.13+ in the 22.x line (or Node 24), VS Code and Ollama. Start Ollama and install a model separately:

```sh
ollama pull qwen2.5-coder:3b
npm ci
npm run check
```

Open the repository root or this folder in VS Code. Select **Run DevPilot AI** and press F5. In the development host, open your project folder, then use **DevPilot AI: Open Chat** (`Cmd+Alt+D` on Mac, `Ctrl+Alt+D` elsewhere). Refresh and select an installed model. If VS Code remembers an older left-hand location, use the DevPilot view's **Move View** menu to move it to the Secondary Side Bar or reset its location.

## Coding workflow

- **Agent** (initial default): inspect, plan, edit multiple files sequentially, run approved tests, and report evidence. Each file has its own diff approval; commands have separate approval.
- **Plan**: inspect code without edits or processes. Use **Execute plan** to move to Agent after reviewing the result.
- **Chat**: messages only, without file retrieval.
- Attach up to four allowed project files with the paperclip. Attachments include bounded excerpts; the model can read additional lines. Attaching in Chat switches to Plan. Root `AGENTS.md` guidance and recent conversation context are included in agent requests within the context budget. The model is instructed to inspect nested guidance before edits.
- Follow a task checklist and expandable activity cards with command output and applied diff excerpts. Stop cancels future work; earlier changes remain. Undo previews the inverse diff and requires approval.
- Explain, Fix Selected Code and Generate Tests remain available in the editor context menu. These start in Plan mode.

## Task changes and development processes

Expand **Workspace changes & processes** in the sidebar. Each coding task groups its approved file edits into a persistent checkpoint. Click a path to review the aggregate diff; **Undo task with review** reverts the latest task in reverse order, with approval for every file edit. All affected final file states are checked before undo begins. Manual changes block undo; rejection stops it and retains the remaining records. This is a sequence of approved changes, not an atomic transaction. Retention is at most 20 edits; complete older task groups are evicted together. Commands and their side effects are not checkpointed.

**Run npm dev** / **Run npm start** preview the actual package script and hooks before approval. One background process can run per workspace, with bounded output, a ten-minute lifetime and an explicit Stop action. The agent also has start/read/stop process tools for server tasks. Running status does not prove HTTP readiness. Processes are stopped on workspace disposal/reload; they are not resumed after restarting VS Code. Command palette actions include **Review Last Task Changes**, **Undo Last Task Changes** and **Start Development Process**.

## Task boundaries and verification

Inline requests such as **Change only `src/add.ts` and `src/helpers.ts`.** limit FileEditor create/edit/replace/patch/delete calls to those literal paths, before diff approval. The agent can still read test files and other evidence. Explicit exclusions are respected; unsupported path/glob forms are blocked rather than treated as unrestricted writes. General prose restrictions are not a full natural-language policy engine. Approved project commands can have side effects outside this file-tool boundary; they are not OS-sandboxed.

Build/lint/check success no longer satisfies test verification after code changes. Test evidence requires a recognized test invocation, and known help/list/collect-only/no-run flags are excluded. A successful test script still needs its output inspected for coverage and test counts.

## Small multi-file repairs

For narrowly scoped tasks naming two to four small source files, the agent reads shared evidence, offers a baseline test when an npm/pytest runner is explicit, then asks the model for one reviewed file proposal at a time. File paths and current hashes come from host-held reads. Every edit still opens the full native diff and requires approval. A failing verification permits one focused repair pass after refreshing the files. Large/incomplete source excerpts or unavailable/oversized applicable AGENTS.md guidance fall back to the regular tool loop.

The original two-file arithmetic fixture now passes with Qwen 3B. A second string-processing fixture still fails with that model. Staging improves execution but does not establish broad coding reliability. See VALIDATION.md for all recorded attempts.

## Project inspection

Explicit read-only requests enforce Plan restrictions even when Agent is selected. Inspection uses a reduced tool catalog and role-based selection of current documentation, its matching manifest and (for architecture requests) an entry point. Archived/legacy docs are skipped unless explicitly requested. README-and-manifest requests require only that evidence, with implementation details left unverified. Bounded excerpts survive tool-result eviction. The host requires successful reads and references to inspected paths; listing-only or repeatedly uncited answers are withheld. The execution record lists files read. These checks establish provenance, not a guarantee that every model interpretation is correct. Ask follow-up questions about named files for a deeper review.

## Tools and limits

25 validated tools cover files, literal search, symbols, definitions/references, diagnostics, dependencies, workspace info, task checklists, create/edit/targeted replacement/patch/delete, commands/tests, Git inspection and optional semantic retrieval. Symbol and diagnostic results depend on installed language providers. Empty diagnostics do not mean tests passed.

`devpilot.maxSteps` defaults to 40 (range 4–100). Repeated identical calls are stopped; one malformed JSON decision can be retried. Model decisions time out at two minutes, tasks at ten minutes, commands at 60 seconds. Small local models still work best on narrow tasks; this is not a claim of Claude Code/Codex reliability or feature parity.

Tools require a trusted local workspace. The active editor's workspace folder is targeted, otherwise the first folder. Reads accept UTF-8 files up to 128 KiB. Read results have a full-file hash, 1-based line ranges and a 12,000-character excerpt limit. File listing caps at 1,500 files/10,000 entries; literal text search scans at most 200 files/30 matches. Secret filename, ignore and link exclusions apply; arbitrary source text is not automatically redacted.

Approved command support includes npm test/build/lint/typecheck/check/dev/start (with arguments), Python/Python 3 pytest, Cargo, Go, Swift and .NET build/test/quality commands. These toolchains must already be installed. Commands run real project code and are not OS-sandboxed. Shell strings, arbitrary interpreters, Git mutations and deployment commands are not exposed.

Optional `devpilot.embeddingModel` uses a separately installed embedding model for up to 48 files/1,800 characters each. No models are downloaded automatically. Conversation history (100 sessions per workspace, 40 messages each), vectors and 20 undo records persist as unencrypted local JSON in VS Code extension storage.

## Development

```sh
npm run check        # types, lint, tests, build
npm run test:host    # isolated native VS Code editor/tool integration
npm run model:setup -- deepseek-small # optional local DeepSeek download
npm run smoke:coding -- qwen2.5-coder:3b # real model edit-and-test fixture
npm run smoke:coding -- qwen2.5-coder:3b --multi # two-file repair and grouped undo
npm run smoke:coding -- qwen2.5-coder:3b --strings # harder string task (currently failing)
npm run smoke:inspection # real model architecture-inspection fixture
npm run smoke:agent  # real qwen2.5-coder:3b read-tool fixture
npm run package     # versioned VSIX, SHA-256 and inventory report
```

The root package delegates to this folder. The webview shares this package's dependencies and lockfile; do not install it separately. Builds are explicit; restart the extension development host after rebuilding. No cloud API keys or `.env` files are required.

See INSTALLATION.md, DEVELOPMENT.md, SECURITY.md, ARCHITECTURE.md and VALIDATION.md for setup, evidence and remaining limits.

Entry-point/startup questions use guided read-only inspection of the primary manifest, available startup configuration and current candidate entry files. Multiple candidate apps are reported as candidates, not assumed to be the configured production process. Repeated calls stop with an incomplete execution report; no stopped task is offered as an executable plan. Transport failures show a non-empty incomplete response and preserve partial streamed text. These paths have fixture coverage; live small-model reliability is not established.

The sidebar footer and new execution records show the running version, source-derived build ID and installed/development mode. **DevPilot AI: Show Running Version** also reports it. Installing a VSIX into ordinary VS Code does not replace code already loaded in an Extension Development Host: close that host and start a fresh F5 session from the repository after rebuilding. Explicit file-read explanations and explanations after discovery cannot finish with zero successful file reads, independently of guided inspection routing.

Startup explanations need a citation to at least one actually inspected source file, rather than an arbitrary two-file minimum. A read dependency/startup manifest alone is not a source citation. Validation messages distinguish missing reads from missing exact-path citations and permit one correction before an explicit incomplete result. These are provenance/format checks, not semantic verification of framework or startup claims.

Agent implementation requests that finish with only a plan receive one bounded execution correction. Code changes without a recorded passing test receive a separate verification correction unless tests/commands were prohibited. Unresolved cases return an incomplete report; a recorded passing test can justify a no-op without forced edits. The Qwen 3B disposable calculator trial passed read/edit/test/independent-rerun/byte-exact-undo, using fixture approval callbacks rather than sidebar clicks. See VALIDATION.md and artifacts/coding-trial-qwen3b.json.

**DevPilot AI: Run npm Tests** (or the test-beaker button) performs direct test verification in Agent mode without calling the model. It uses the normal workspace-trust checks, script preview, approval card, command allowlist and cancellation. The host reports the actual exit code and shows tool output in Task activity. It does not apply file edits; project tests still execute project code under the approved command. Plan and Chat block this action. Use it when a previous edit exists but the model did not run verification; do not ask the model to reapply an already-present fix.

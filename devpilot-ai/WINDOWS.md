# Windows support

DevPilot's VSIX is shared across Mac and Windows: the production extension/webview are bundled JavaScript, and model inference uses Ollama's local HTTP API rather than an OS-specific Python/MLX runtime.

## Required software

- Windows 10 22H2 or newer for the current Ollama Windows app; see [Ollama's Windows requirements](https://docs.ollama.com/windows) for supported GPU/driver combinations.
- VS Code 1.106+.
- Node 22.13+ in the 22.x line or Node 24, npm and Git for developing/testing DevPilot.
- Ollama for Windows. Start it from the Start menu; it normally serves `http://localhost:11434` in the background.

Select a model according to the Windows machine's RAM/VRAM, not the Mac's specs. A 16 GB Windows PC can start conservatively with Coder 1.3B in low-memory mode, but CPU/GPU performance differs. Use the setup panel's hardware guidance and test a small task first.

## Install and use

Install the VSIX with **Extensions: Install from VSIX**, then reload VS Code. Open DevPilot with **Ctrl+Alt+D**, or **Ctrl+Shift+P → DevPilot AI: Open Chat**. The view is contributed to the right-hand Secondary Side Bar. Start Ollama, refresh, and use **Set Up DeepSeek Models** to download/select a free local model. No cloud API keys are needed.

## Development in PowerShell

```powershell
cd path\to\local-llm
npm ci
npm run check
npm run test:host
```

Select **Run DevPilot AI** and press **F5** to launch the development host. Standard per-user and Program Files VS Code installations are detected for the host test. Override if required:

```powershell
$env:VSCODE_EXECUTABLE = 'C:\Program Files\Microsoft VS Code\Code.exe'
npm run test:host
```

`npm run smoke:coding -- deepseek-coder:1.3b` uses the same cross-platform wrapper on Mac and Windows; it does not require POSIX environment-assignment syntax. Python projects normally use the `pytest` runner (`python -m pytest`) on Windows; `python3` is also available as a tool when installed.

## Platform-specific protections and checks

- Tool paths remain workspace-relative with forward slashes. Native filesystem paths are constructed by Node/VS Code.
- npm is launched through Windows cmd.exe using strictly validated tokens; arbitrary shell strings/injection characters are rejected. Other toolchains spawn directly.
- Cancellation/timeouts terminate Windows process trees using taskkill; POSIX uses process groups.
- Windows device names, alternate streams, traversal, links, ignored paths and secret filenames are blocked. Existing CRLF edit/hash/undo regressions remain covered.
- The existing GitHub workflow checks Windows/Linux. On GitHub Windows workers, `tests/native-ci.test.ts` also runs actual native VS Code acceptance within `npm run check`, downloading an isolated official editor through Microsoft's `@vscode/test-electron` helper. No models are downloaded or real inference run in CI.

## Verified Windows execution

[CI run 43582200815](https://github.com/abhiroy00/local-llm/actions/runs/43582200815) passed on verification commit `b4ea9ed86715bd1f236728e52b42901e4ff22acc`: 115 tests in 14 files, type/lint/build checks, production audit and VSIX packaging. Native Windows acceptance verified extension/sidebar opening, file reads, Plan/secret blocking, rejected creation, approved create/edit/revert, grouped task undo, commands and actual HTTP server readiness/stop. Its report identifies `platform: win32`, `version: 0.6.1`, `build: 2d552e9919d6`.

This verifies native editor/file/process behavior, not real Ollama inference or native approval-card clicks on Windows. Approvals use a fixture-only callback; React DOM tests separately exercise rendered button/host-message behavior.

`npm run test:host` writes `artifacts/native/win32-tools.json` on Windows. CI prints that result in job logs and uploads the Windows package/checksum/inventory as `devpilot-windows-latest`. The downloaded package's SHA-256 and embedded version/build were independently checked locally. The verification branch keeps the existing workflow unchanged because the CLI token lacks workflow-file write scope; no broader credential permission was requested.

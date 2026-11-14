# Installation

Requires Node 22.13+ in the 22.x line or Node 24, npm, VS Code 1.106+, and separately installed Ollama. On Apple Silicon use native arm64 builds. No cloud API key, database server or `.env` file is needed.

Start the Ollama app (or run `ollama serve` in a separate terminal). Install the model used by the smoke test:

```sh
ollama pull qwen2.5-coder:3b
ollama list
```

From the repository root:

```sh
npm ci
npm run check
```

Root installation delegates dependency installation to `devpilot-ai`. You can instead run both commands inside `devpilot-ai`; the webview does not need its own install.

Open the root or extension folder in VS Code. Select **Run DevPilot AI** and press F5 (Fn+F5 if required by your Mac keyboard). In the host open your actual project, then **DevPilot AI: Open Chat** (`Cmd+Alt+D` on Mac). The extension contributes to the right-hand Secondary Side Bar. If an older location is remembered, move the DevPilot view to the Secondary Side Bar using its context menu. Refresh models and select an installed chat model.

## Install a VSIX

Run `npm run package`, then use **Extensions: Install from VSIX** and select `devpilot-ai/artifacts/devpilot-ai-0.6.2.vsix` when packaging from the root. Reload VS Code. The package also has a SHA-256 checksum and inventory report. Marketplace publishing is not configured.

## Settings

- `devpilot.ollamaEndpoint`: local origin; default `http://localhost:11434`.
- `devpilot.contextLimit`: default 4096; range 1024–32768. Agent tool catalogs require room; increase this when a task reports a context-budget error. Larger windows require more memory.
- `devpilot.maxSteps`: default 40; range 4–100, within the ten-minute task deadline.
- `devpilot.ignorePatterns`: additional gitignore-style exclusions.
- `devpilot.embeddingModel`: optional installed embedding model; empty disables semantic retrieval.

## macOS integration check

`npm run test:host` detects conventional macOS installations, including Code/Electron executable names. Override detection if needed:

```sh
VSCODE_EXECUTABLE="/Applications/Visual Studio Code.app/Contents/MacOS/Code" npm run test:host
```

Use the executable that exists in your installation. The harness creates an isolated temporary profile and fixture workspace. It does not test clicking the sidebar approval cards.

Disconnected: start Ollama/check endpoint. No models: install one separately. Tools blocked: open a trusted local folder. Context/loop error: narrow the task or increase context/select a suitable model. Stale diff: save and reread. Markdown debug popup: select Run DevPilot AI. After rebuilding, restart the development host to load changes.

## DeepSeek and Windows

Open **DevPilot AI: Set Up DeepSeek Models** to download and select a quantized free local model. For a 16 GB Mac start conservatively with `deepseek-coder:1.3b` and low-memory mode. The interrupted 6.7B coding test is not a pass. See MODELS.md for official checkpoint provenance and memory limits, and WINDOWS.md for PowerShell/setup instructions. The same VSIX works on both platforms; no model weights are bundled.

## Confirm the running build

Use **DevPilot AI: Show Running Version** or read the sidebar footer. It shows version, build ID and installed/development mode. Close an existing Extension Development Host before starting a new F5 session; installing a VSIX does not update code that host already loaded. For installed use, install the VSIX and reload that VS Code window. Start a new conversation so old answers are not confused with new execution records.

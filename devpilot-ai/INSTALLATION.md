# Installation

For the development build, install Node.js 22+ and VS Code 1.95+, run `npm ci` and `npm run check` in this folder, then press F5 in VS Code. The debug configuration builds before launching an isolated Extension Development Host.

For a local VSIX, after validation run `npx @vscode/vsce package --allow-missing-repository` and install through Extensions: Install from VSIX. Packaging tooling is downloaded on demand. Marketplace publishing is not configured; the `devpilot` publisher is a local development identifier.

Ollama is not required for Phase 1. In the next phase users will install it separately and select locally installed models. No model is bundled, downloaded or selected automatically. Settings reserve `devpilot.ollamaEndpoint` (default `http://localhost:11434`) and `devpilot.contextLimit` for that integration; they currently do not initiate network calls. No model compatibility has been validated yet.

If the sidebar is missing, confirm you opened the project folder rather than its parent, ran the build successfully, and are checking the Extension Development Host. If draft UI appears stale, run Developer: Reload Window in that host.

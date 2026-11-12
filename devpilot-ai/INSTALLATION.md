# Installation

Requires Node.js 22+, npm, VS Code 1.95+ and separately installed Ollama. Run npm ci and npm run check inside devpilot-ai. Open the root or extension folder, select Run DevPilot AI and press F5. In the host, open your actual project and DevPilot.

## VSIX

Run npm run package. Install artifacts/devpilot-ai-0.3.1.vsix using Extensions: Install from VSIX, then reload. The filename follows package.json's version automatically. Matching SHA-256 and package-report files are generated. Bundled assets/docs are included; node_modules, models, tests and source maps are excluded. Marketplace publishing is not configured.

## Settings

- devpilot.ollamaEndpoint: local origin, default http://localhost:11434.
- devpilot.contextLimit: default 4096; larger windows use more memory.
- devpilot.ignorePatterns: additional gitignore-style exclusions.
- devpilot.embeddingModel: empty by default; optional installed embedding model.

Start Ollama and refresh. qwen2.5-coder:3b passed chat and read-tool smoke tests. Agent requires schema-constrained JSON support. No model is bundled or automatically pulled.

Disconnected: start Ollama/check endpoint. No models: install one separately. Tools blocked: open a trusted local folder. Context/loop error: narrow task or choose suitable model/context. Stale diff: save files and reread. Markdown debug popup: select Run DevPilot AI. Updater lock: complete the pending VS Code update before launching another host.

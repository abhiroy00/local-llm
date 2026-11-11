# DevPilot AI

**Your Code. Your Machine. Your AI.**

A local-first VS Code coding assistant under incremental development. Version 0.1 implements Phase 1 only: Activity Bar entry, React sidebar, persisted task draft, new conversation/reset, settings, validated webview messages and a restricted content security policy.

Chat, model selection, code editing, terminal tools and indexing are not implemented yet. The sidebar clearly labels this state; it does not simulate model responses.

## Development

Requires Node.js 22+, npm and VS Code 1.95+. Run `npm ci`, then `npm run check`. Open this folder in VS Code and press F5 using **Run DevPilot AI**. In the Extension Development Host, open the DevPilot AI Activity Bar entry.

The React UI dependencies are managed by the root lockfile; do not install separately in `webview-ui`.

See [DEVELOPMENT.md](DEVELOPMENT.md), [INSTALLATION.md](INSTALLATION.md), [ARCHITECTURE.md](ARCHITECTURE.md), [SECURITY.md](SECURITY.md), and [ROADMAP.md](ROADMAP.md).

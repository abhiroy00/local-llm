# local-llm

Home of **DevPilot AI**, a local-first AI coding assistant for VS Code.

The DevPilot AI 0.6 coding agent preview is in [devpilot-ai](devpilot-ai/README.md): a right-hand VS Code sidebar, local chat, 25 workspace/code tools, task plans, persistent task checkpoints, approved changes/commands and bounded development processes. VS Code 1.106+ is required. See its validation report for tested behavior and pending production checks.

## Development

From the repository root:

```sh
npm ci        # installs the extension's dependencies; skipped when node_modules already matches devpilot-ai/package-lock.json
npm run check # typecheck, lint, tests and build
```

The root `package.json` has no dependencies of its own; its scripts delegate to `devpilot-ai/` with `npm --prefix`. Running `npm ci` and the scripts inside `devpilot-ai` directly still works. Other scripts: `npm test`, `npm run build`, `npm run package`, `npm run test:host`, `npm run smoke:agent`.

Open either this repository root or the `devpilot-ai` folder in VS Code. In Run and Debug, select **Run DevPilot AI** and press F5 to launch the extension development host. Both folders include matching launch configurations. See the project documentation for implemented features and pending verification.
